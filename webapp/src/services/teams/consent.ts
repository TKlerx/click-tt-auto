import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  getAuthBaseUrl,
  getConfiguredBasePath,
  getScopedCookiePath,
} from "@/lib/azure-auth";

export const TEAMS_CONSENT_STATE_COOKIE = "starter_app_teams_consent_state";
const TEAMS_DELEGATED_SCOPE = "offline_access ChannelMessage.Send";
const ENCRYPTED_TOKEN_PREFIX = "enc:v1";

type TeamsTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

function getTeamsGrantEncryptionSecret() {
  const configured =
    process.env.TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY ??
    process.env.BETTERAUTH_SECRET;

  if (!configured?.trim()) {
    throw new Error(
      "Missing delegated grant encryption secret. Set TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY or BETTERAUTH_SECRET.",
    );
  }

  return configured.trim();
}

function deriveEncryptionKey(secret: string) {
  return crypto
    .createHash("sha256")
    .update(secret)
    .update(":teams-delegated-grant:v1")
    .digest();
}

export function encryptGrantToken(token: string) {
  const iv = crypto.randomBytes(12);
  const key = deriveEncryptionKey(getTeamsGrantEncryptionSecret());
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: 16,
  });
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_TOKEN_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptGrantToken(value: string) {
  if (!value.startsWith(`${ENCRYPTED_TOKEN_PREFIX}:`)) {
    return value;
  }

  const payload = value.slice(`${ENCRYPTED_TOKEN_PREFIX}:`.length);
  const [ivBase64, tagBase64, dataBase64] = payload.split(":");
  if (!ivBase64 || !tagBase64 || !dataBase64) {
    throw new Error("Invalid encrypted delegated grant token format.");
  }

  const key = deriveEncryptionKey(getTeamsGrantEncryptionSecret());
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivBase64, "base64url"),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataBase64, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function createTeamsConsentState() {
  return crypto.randomBytes(24).toString("hex");
}

export function getTeamsConsentRedirectUri(request: Request) {
  return `${getAuthBaseUrl(request)}/api/integrations/teams/consent/callback`;
}

export function getTeamsConsentCookiePath() {
  return getScopedCookiePath();
}

export function getTeamsConsentAppRedirectPath(path: string) {
  const raw = (path || "").trim();
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;

  const configuredBasePath = getConfiguredBasePath().trim();
  const basePath = configuredBasePath
    ? configuredBasePath.startsWith("/")
      ? configuredBasePath.replace(/\/+$/, "")
      : `/${configuredBasePath.replace(/\/+$/, "")}`
    : "";

  if (!basePath) {
    return normalized;
  }

  if (normalized === basePath || normalized.startsWith(`${basePath}/`)) {
    return normalized;
  }

  return `${basePath}${normalized}`;
}

export function getTeamsAuthorizeUrl(request: Request, state: string) {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!tenantId || !clientId) {
    throw new Error("Azure AD configuration is incomplete.");
  }

  const authorizeUrl = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  );
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "redirect_uri",
    getTeamsConsentRedirectUri(request),
  );
  authorizeUrl.searchParams.set("response_mode", "query");
  authorizeUrl.searchParams.set("scope", TEAMS_DELEGATED_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "consent");
  return authorizeUrl;
}

export async function exchangeTeamsConsentCode(request: Request, code: string) {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure AD configuration is incomplete.");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: getTeamsConsentRedirectUri(request),
        scope: TEAMS_DELEGATED_SCOPE,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Teams consent token exchange failed: ${response.status} ${details}`,
    );
  }

  return (await response.json()) as TeamsTokenResponse;
}

export async function saveTeamsDelegatedGrant(
  userId: string,
  token: TeamsTokenResponse,
) {
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000)
    : null;
  return prisma.teamsDelegatedGrant.upsert({
    where: { userId },
    update: {
      scope: token.scope ?? TEAMS_DELEGATED_SCOPE,
      accessToken: encryptGrantToken(token.access_token),
      refreshToken: token.refresh_token
        ? encryptGrantToken(token.refresh_token)
        : null,
      expiresAt,
    },
    create: {
      userId,
      scope: token.scope ?? TEAMS_DELEGATED_SCOPE,
      accessToken: encryptGrantToken(token.access_token),
      refreshToken: token.refresh_token
        ? encryptGrantToken(token.refresh_token)
        : null,
      expiresAt,
    },
  });
}

export async function getTeamsDelegatedGrantStatus(userId: string) {
  const grant = await prisma.teamsDelegatedGrant.findUnique({
    where: { userId },
    select: {
      id: true,
      scope: true,
      expiresAt: true,
      updatedAt: true,
    },
  });
  if (!grant) {
    return {
      connected: false,
      scope: null,
      expiresAt: null,
      updatedAt: null,
    };
  }

  return {
    connected: true,
    scope: grant.scope,
    expiresAt: grant.expiresAt,
    updatedAt: grant.updatedAt,
  };
}

export async function getFreshTeamsDelegatedAccessToken(userId: string) {
  const grant = await prisma.teamsDelegatedGrant.findUnique({
    where: { userId },
  });
  if (!grant) {
    return null;
  }

  if (grant.expiresAt && grant.expiresAt.getTime() > Date.now() + 60_000) {
    return decryptGrantToken(grant.accessToken);
  }

  if (!grant.refreshToken) {
    return null;
  }
  const refreshToken = decryptGrantToken(grant.refreshToken);

  const tenantId = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure AD configuration is incomplete.");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: TEAMS_DELEGATED_SCOPE,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Teams refresh token exchange failed: ${response.status} ${details}`,
    );
  }

  const token = (await response.json()) as TeamsTokenResponse;
  await saveTeamsDelegatedGrant(userId, token);
  return token.access_token;
}
