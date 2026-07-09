import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../generated/prisma/enums";
import {
  getConfiguredBasePath,
  getScopedCookiePath,
  hasRealAzureAdConfig,
  trimTrailingSlash,
} from "@/lib/azure-auth";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  getDatabaseProviderForUrl,
  resolveAppDatabaseUrl,
} from "@/lib/database-url";
import { prisma } from "@/lib/db";

export const BETTER_AUTH_COOKIE_PREFIX = "business-app-starter";
export const BETTER_AUTH_API_BASE_PATH = `${getConfiguredBasePath()}/api/auth`;

function getDatabaseProvider() {
  return getDatabaseProviderForUrl(resolveAppDatabaseUrl());
}

export function getConfiguredAuthBaseUrl() {
  const configuredOrigin = process.env.AUTH_BASE_URL?.trim();
  const fallbackOrigin = `http://localhost:${process.env.PORT ?? "3000"}`;
  return trimTrailingSlash(configuredOrigin || fallbackOrigin);
}

export function getBetterAuthCookieNames() {
  const securePrefix = getConfiguredAuthBaseUrl().startsWith("https://")
    ? "__Secure-"
    : "";
  return [
    `${securePrefix}${BETTER_AUTH_COOKIE_PREFIX}.session_token`,
    `${securePrefix}${BETTER_AUTH_COOKIE_PREFIX}.session_data`,
    `${securePrefix}${BETTER_AUTH_COOKIE_PREFIX}.dont_remember`,
    `${securePrefix}${BETTER_AUTH_COOKIE_PREFIX}.account_data`,
  ];
}

function getAuthSecret() {
  const fallbackSecret = "dev-secret-change-me-in-production";
  const secret =
    process.env.BETTERAUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!secret || secret === fallbackSecret)
  ) {
    throw new Error(
      "FATAL: BetterAuth is using the development secret in production. Set BETTERAUTH_SECRET or BETTER_AUTH_SECRET.",
    );
  }
  return secret ?? fallbackSecret;
}

export const auth = betterAuth({
  secret: getAuthSecret(),
  baseURL: getConfiguredAuthBaseUrl(),
  basePath: BETTER_AUTH_API_BASE_PATH,
  database: prismaAdapter(prisma, {
    provider: getDatabaseProvider(),
  }),
  plugins: [nextCookies()],
  advanced: {
    cookiePrefix: BETTER_AUTH_COOKIE_PREFIX,
    trustedProxyHeaders: !!process.env.AUTH_BASE_URL,
    defaultCookieAttributes: {
      path: getScopedCookiePath(),
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    password: {
      hash: hashPassword,
      verify({ password, hash }) {
        return verifyPassword(password, hash);
      },
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["microsoft"],
    },
  },
  socialProviders: hasRealAzureAdConfig()
    ? {
        microsoft: {
          clientId: process.env.AZURE_AD_CLIENT_ID!,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
          tenantId: process.env.AZURE_AD_TENANT_ID!,
        },
      }
    : undefined,
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
        defaultValue: Role.SCOPE_USER,
      },
      status: {
        type: "string",
        input: false,
        defaultValue: UserStatus.PENDING_APPROVAL,
      },
      authMethod: {
        type: "string",
        input: false,
        defaultValue: AuthMethod.SSO,
      },
      mustChangePassword: {
        type: "boolean",
        input: false,
        defaultValue: false,
      },
      themePreference: {
        type: "string",
        input: false,
        defaultValue: ThemePreference.LIGHT,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          return {
            data: {
              ...user,
              email: user.email.toLowerCase(),
            },
          };
        },
      },
    },
  },
});
