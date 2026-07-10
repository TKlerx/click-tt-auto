import {
  getPasswordComplexityErrorMessage,
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
} from "@/lib/auth";
import { safeLogAudit } from "@/lib/audit";
import { auth } from "@/lib/better-auth";
import { applySetCookieHeaders } from "@/lib/better-auth-http";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getConfiguredBasePath } from "@/lib/azure-auth";
import type { SessionUser } from "@/lib/auth";
import { AuditAction } from "../../../generated/prisma/enums";
import { NextResponse } from "next/server";

export async function changePasswordForUser(
  request: Request,
  user: Pick<SessionUser, "id" | "email">,
  body: {
    currentPassword?: string;
    newPassword?: string;
  },
) {
  if (!body.currentPassword || !body.newPassword) {
    return jsonError("Current and new password are required", 400);
  }

  if (!validatePasswordComplexity(body.newPassword)) {
    return jsonError(getPasswordComplexityErrorMessage(), 400);
  }

  const credentialAccount = await prisma.account.findUnique({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: user.email.toLowerCase(),
      },
    },
    select: {
      password: true,
    },
  });

  if (!credentialAccount?.password) {
    return jsonError(
      "Password change is only available for local accounts",
      400,
    );
  }

  const valid = await verifyPassword(
    body.currentPassword,
    credentialAccount.password,
  );

  if (!valid) {
    return jsonError("Current password is incorrect", 401);
  }

  const nextPasswordHash = await hashPassword(body.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        mustChangePassword: false,
      },
    }),
    prisma.account.update({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: user.email.toLowerCase(),
        },
      },
      data: {
        password: nextPasswordHash,
      },
    }),
  ]);

  await auth.api.revokeOtherSessions({
    headers: new Headers(request.headers),
  });

  await safeLogAudit({
    action: AuditAction.AUTH_PASSWORD_CHANGED,
    entityType: "User",
    entityId: user.id,
    actorId: user.id,
  });

  return NextResponse.json({ message: "Password changed successfully" });
}

export async function signOutUser(
  request: Request,
  sessionUser: Pick<SessionUser, "id"> | null,
) {
  const authResponse = await auth.api.signOut({
    headers: new Headers(request.headers),
    asResponse: true,
  });

  if (sessionUser) {
    await safeLogAudit({
      action: AuditAction.AUTH_LOGOUT_SUCCEEDED,
      entityType: "User",
      entityId: sessionUser.id,
      actorId: sessionUser.id,
    });
  }

  const url = new URL(request.url);
  const response = NextResponse.redirect(
    new URL(`${getConfiguredBasePath()}/login`, url),
  );
  return applySetCookieHeaders(response, authResponse);
}
