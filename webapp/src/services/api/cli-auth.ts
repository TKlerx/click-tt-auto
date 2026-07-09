import crypto from "node:crypto";
import { safeLogAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import {
  generateToken,
  getDefaultTokenExpiryDays,
  getMaxActiveTokensPerUser,
  getTokenDisplayPrefix,
  hashToken,
} from "@/services/api/tokens";
import { AuditAction, TokenType } from "../../../generated/prisma/enums";

const AUTH_CODE_TTL_SECONDS = 60;
export const CLI_AUTH_CSRF_COOKIE = "starter_app_cli_auth_csrf";
export const CLI_AUTH_CSRF_QUERY_PARAM = "approval";
const CLI_TOKEN_NAME_PREFIX = "CLI Login";

function getAuthCodeExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + AUTH_CODE_TTL_SECONDS);
  return expiresAt;
}

export function isValidCliCallbackUrl(callbackUrl: string) {
  try {
    const parsed = new URL(callbackUrl);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export async function getCliAuthCodeForApproval(codeId: string) {
  const record = await prisma.cliAuthCode.findUnique({
    where: { id: codeId },
    select: {
      id: true,
      callbackUrl: true,
      expiresAt: true,
      exchanged: true,
      userId: true,
    },
  });

  if (
    !record ||
    record.expiresAt < new Date() ||
    record.exchanged ||
    record.userId
  ) {
    return null;
  }

  return record;
}

export async function createAuthCode(callbackUrl: string, state: string) {
  const record = await prisma.cliAuthCode.create({
    data: {
      code: crypto.randomBytes(24).toString("base64url"),
      callbackUrl,
      state,
      expiresAt: getAuthCodeExpiryDate(),
    },
  });

  return record;
}

export async function bindAuthCodeToUser(codeId: string, userId: string) {
  const record = await prisma.cliAuthCode.findUnique({
    where: { id: codeId },
  });

  if (
    !record ||
    record.expiresAt < new Date() ||
    record.exchanged ||
    (record.userId && record.userId !== userId)
  ) {
    return { error: jsonError("CLI login request has expired", 400) };
  }

  const updated = await prisma.cliAuthCode.update({
    where: { id: codeId },
    data: {
      userId,
    },
  });

  return { authCode: updated };
}

function buildTokenExpiryDate(expiresInDays: number) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt;
}

export async function exchangeAuthCode(code: string, state: string) {
  const exchanged = await prisma.$transaction(async (tx) => {
    const consumed = await tx.cliAuthCode.updateMany({
      where: {
        code,
        state,
        exchanged: false,
        expiresAt: {
          gt: new Date(),
        },
        userId: {
          not: null,
        },
      },
      data: {
        exchanged: true,
      },
    });

    if (consumed.count !== 1) {
      return null;
    }

    const record = await tx.cliAuthCode.findUnique({
      where: { code },
      include: {
        user: true,
      },
    });

    const user = record?.user;
    const userId = record?.userId;
    if (!record || !userId || !user) {
      throw new Error("Consumed CLI auth code is missing a user.");
    }

    const activeCount = await tx.personalAccessToken.count({
      where: {
        userId,
        status: "ACTIVE",
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (activeCount >= getMaxActiveTokensPerUser()) {
      return {
        error: jsonError("You have reached the active token limit", 429),
      };
    }

    const tokenValue = generateToken();
    const token = await tx.personalAccessToken.create({
      data: {
        userId,
        name: `${CLI_TOKEN_NAME_PREFIX} ${new Date().toISOString()} ${crypto.randomBytes(4).toString("hex")}`,
        tokenHash: hashToken(tokenValue),
        tokenPrefix: getTokenDisplayPrefix(tokenValue),
        type: TokenType.CLI_LOGIN,
        expiresAt: buildTokenExpiryDate(
          getDefaultTokenExpiryDays(TokenType.CLI_LOGIN),
        ),
      },
    });

    return { record, token, tokenValue, user, userId };
  });

  if (!exchanged) {
    return { error: jsonError("Invalid or expired authorization code", 400) };
  }

  if ("error" in exchanged) {
    return exchanged;
  }

  await safeLogAudit({
    action: AuditAction.CLI_LOGIN_COMPLETED,
    entityType: "CliAuthCode",
    entityId: exchanged.record.id,
    actorId: exchanged.userId,
    details: {
      callbackUrl: exchanged.record.callbackUrl,
    },
  });

  return {
    token: exchanged.tokenValue,
    expiresAt: exchanged.token.expiresAt,
    user: {
      name: exchanged.user.name,
      email: exchanged.user.email,
      role: exchanged.user.role,
    },
  };
}

export async function cleanupExpiredCodes() {
  await prisma.cliAuthCode.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
}
