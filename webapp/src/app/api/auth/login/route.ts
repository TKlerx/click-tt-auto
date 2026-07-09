import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { safeLogAudit } from "@/lib/audit";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/db";
import { applySetCookieHeaders } from "@/lib/better-auth-http";
import { jsonError } from "@/lib/http";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  AuditAction,
  AuthMethod,
  UserStatus,
} from "../../../../../generated/prisma/enums";

const DUMMY_PASSWORD_HASH =
  process.env.AUTH_DUMMY_PASSWORD_HASH ??
  ["$2b", "12", "y2Qs9vpYONDfvCzuE8RFJOe9a9BH64nv61TPNm3xrdTNB7/SwXKoe"].join(
    "$",
  );

function getSafeRedirectTarget(redirectTo?: string) {
  if (!redirectTo?.startsWith("/") || redirectTo.startsWith("//")) {
    return null;
  }

  return redirectTo;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    redirectTo?: string;
  };

  if (!body.email || !body.password) {
    return jsonError("Email and password are required", 400);
  }

  const email = body.email.toLowerCase();
  const clientIp = getClientIp(request);
  const loginBucketKey =
    clientIp === "unknown" ? `email:${email}` : `ip:${clientIp}`;
  const rateLimit = checkRateLimit(loginBucketKey, "login");
  if (!rateLimit.allowed) {
    const response = jsonError(
      "Too many login attempts. Please try again later.",
      429,
    );
    response.headers.set(
      "Retry-After",
      Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
    );
    return response;
  }

  const accountLimit = checkRateLimit(email, "login-account", {
    maxAttempts: 10,
  });
  if (!accountLimit.allowed) {
    const response = jsonError(
      "Too many login attempts for this account. Please try again later.",
      429,
    );
    response.headers.set(
      "Retry-After",
      Math.ceil(accountLimit.retryAfterMs / 1000).toString(),
    );
    return response;
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });
  const credentialAccount = await prisma.account.findUnique({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: email,
      },
    },
    select: {
      password: true,
    },
  });
  const passwordHash = credentialAccount?.password ?? DUMMY_PASSWORD_HASH;
  const validPassword = await verifyPassword(body.password, passwordHash);

  if (!user || !credentialAccount?.password || !validPassword) {
    return jsonError("Invalid email or password", 401);
  }

  if (user.status === UserStatus.INACTIVE) {
    await safeLogAudit({
      action: AuditAction.AUTH_LOGIN_REJECTED,
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      details: {
        reason: "inactive_account",
      },
    });
    return jsonError("Invalid email or password", 401);
  }

  const authResponse = await auth.api.signInEmail({
    body: {
      email,
      password: body.password,
    },
    headers: new Headers(request.headers),
    asResponse: true,
  });

  if (!authResponse.ok) {
    await safeLogAudit({
      action: AuditAction.AUTH_LOGIN_REJECTED,
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      details: {
        reason: "invalid_credentials",
      },
    });
    return jsonError("Invalid email or password", 401);
  }

  const authMethod =
    user.authMethod === AuthMethod.SSO ? AuthMethod.BOTH : user.authMethod;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      authMethod,
    },
  });

  await safeLogAudit({
    action: AuditAction.AUTH_LOGIN_SUCCEEDED,
    entityType: "User",
    entityId: user.id,
    actorId: user.id,
    details: {
      method: "password",
    },
  });

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    mustChangePassword: user.mustChangePassword,
    redirectTo: user.mustChangePassword
      ? "/change-password"
      : (getSafeRedirectTarget(body.redirectTo) ?? "/dashboard"),
  });

  return applySetCookieHeaders(response, authResponse);
}
