import { NextResponse } from "next/server";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../../../../../generated/prisma/enums";
import { auth } from "@/lib/better-auth";
import { applySetCookieHeaders } from "@/lib/better-auth-http";
import { getAbsoluteAppUrl } from "@/lib/better-auth-route";
import { hasRealAzureAdConfig } from "@/lib/azure-auth";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

function redirectTo(target: string) {
  return NextResponse.redirect(getAbsoluteAppUrl(target));
}

function getSafeRedirectTarget(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function isAuthorizedProductionMockSso(request: Request) {
  const secret = process.env.E2E_MOCK_SSO_SECRET;
  return (
    process.env.E2E_TESTING === "1" &&
    !!secret &&
    request.headers.get("x-e2e-mock-sso-secret") === secret
  );
}

export async function GET(request: Request) {
  if (
    process.env.E2E_MOCK_SSO === "1" &&
    process.env.NODE_ENV === "production" &&
    !isAuthorizedProductionMockSso(request)
  ) {
    throw new Error("FATAL: E2E_MOCK_SSO must not be enabled in production.");
  }

  const url = new URL(request.url);
  const mockEmail = url.searchParams.get("email");
  const mockName = url.searchParams.get("name");
  const requestedRedirect = getSafeRedirectTarget(
    url.searchParams.get("redirectTo"),
  );

  if (
    process.env.E2E_MOCK_SSO === "1" &&
    (process.env.NODE_ENV !== "production" ||
      isAuthorizedProductionMockSso(request)) &&
    mockEmail
  ) {
    const email = mockEmail.toLowerCase();
    const name = mockName?.trim() || email;
    const mockPassword = `MockSsoPass1!:${email}`;
    const passwordHash = await hashPassword(mockPassword);
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    const authMethod =
      existingUser?.authMethod === AuthMethod.LOCAL
        ? AuthMethod.BOTH
        : (existingUser?.authMethod ?? AuthMethod.SSO);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        emailVerified: true,
        authMethod,
        mustChangePassword: false,
      },
      create: {
        email,
        emailVerified: true,
        name,
        role: Role.SCOPE_USER,
        status: UserStatus.PENDING_APPROVAL,
        authMethod: AuthMethod.SSO,
        mustChangePassword: false,
        themePreference: ThemePreference.LIGHT,
        locale: "en",
      },
    });

    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: email,
        },
      },
      update: {
        userId: user.id,
        password: passwordHash,
      },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: email,
        password: passwordHash,
      },
    });

    const redirectTarget =
      user.status === UserStatus.PENDING_APPROVAL
        ? "/pending"
        : (requestedRedirect ?? "/dashboard");

    const authResponse = await auth.api.signInEmail({
      body: {
        email,
        password: mockPassword,
      },
      headers: new Headers(request.headers),
      asResponse: true,
    });

    if (!authResponse.ok) {
      return redirectTo("/login?error=sso-mock-failed");
    }

    return applySetCookieHeaders(
      redirectTo(redirectTarget),
      authResponse,
    );
  }

  if (!hasRealAzureAdConfig()) {
    return redirectTo("/login?error=sso-config");
  }

  const authResponse = await auth.api.signInSocial({
    body: {
      provider: "microsoft",
      callbackURL: getAbsoluteAppUrl(requestedRedirect ?? "/dashboard"),
    },
    headers: new Headers(request.headers),
    asResponse: true,
  });

  const location = authResponse.headers.get("location");
  if (location) {
    return applySetCookieHeaders(NextResponse.redirect(location), authResponse);
  }

  return authResponse;
}

export const POST = GET;
