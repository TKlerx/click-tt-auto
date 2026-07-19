import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { withSerializableRetry } from "@/services/api/serializable-retry";
import { Prisma } from "../../../generated/prisma/client";
import {
  TokenStatus,
  TokenType,
  UserStatus,
} from "../../../generated/prisma/enums";

const DEFAULT_PAT_PREFIX = "starter_pat";
const DEFAULT_PAT_EXPIRY_DAYS = 90;
const DEFAULT_CLI_EXPIRY_DAYS = 30;
const DEFAULT_PAT_LIMIT = 10;
const RECENTLY_VISIBLE_WINDOW_DAYS = 90;
const TOKEN_SEGMENT_LENGTH = 8;
const tokenLogger = logger.child({ component: "tokens" });

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getTokenPrefix() {
  const configured = process.env.PAT_TOKEN_PREFIX?.trim();
  return configured || DEFAULT_PAT_PREFIX;
}

export function getDefaultTokenExpiryDays(type: TokenType) {
  return type === TokenType.CLI_LOGIN
    ? readPositiveInteger(
        process.env.CLI_TOKEN_DEFAULT_EXPIRY_DAYS,
        DEFAULT_CLI_EXPIRY_DAYS,
      )
    : readPositiveInteger(
        process.env.PAT_DEFAULT_EXPIRY_DAYS,
        DEFAULT_PAT_EXPIRY_DAYS,
      );
}

export function getMaxActiveTokensPerUser() {
  return readPositiveInteger(
    process.env.PAT_MAX_ACTIVE_PER_USER,
    DEFAULT_PAT_LIMIT,
  );
}

export function generateToken(prefix = getTokenPrefix()) {
  const randomPart = crypto.randomBytes(32).toString("base64url");
  return `${prefix}_${randomPart}`;
}

export function hashToken(tokenValue: string) {
  return crypto.createHash("sha256").update(tokenValue).digest("hex");
}

export function getTokenDisplayPrefix(tokenValue: string) {
  const separatorIndex = tokenValue.lastIndexOf("_");
  const suffix =
    separatorIndex >= 0 ? tokenValue.slice(separatorIndex + 1) : tokenValue;
  return suffix.slice(0, TOKEN_SEGMENT_LENGTH);
}

function buildExpiryDate(expiresInDays: number) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt;
}

export function isTokenRecentlyVisible(token: {
  status: TokenStatus;
  expiresAt: Date;
  revokedAt: Date | null;
}) {
  if (token.status === TokenStatus.ACTIVE && token.expiresAt >= new Date()) {
    return true;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENTLY_VISIBLE_WINDOW_DAYS);
  const latestRelevantDate = token.revokedAt ?? token.expiresAt;

  return latestRelevantDate >= cutoff;
}

export function toTokenSummary(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  type: TokenType;
  status: TokenStatus;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  renewalCount: number;
  createdAt: Date;
}) {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    type: token.type,
    status: token.status,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    renewalCount: token.renewalCount,
    createdAt: token.createdAt,
    isExpired: token.expiresAt < new Date(),
  };
}

export async function countActiveTokens(userId: string) {
  return prisma.personalAccessToken.count({
    where: {
      userId,
      status: TokenStatus.ACTIVE,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}

export async function createToken(
  userId: string,
  name: string,
  expiresInDays = getDefaultTokenExpiryDays(TokenType.PAT),
  type: TokenType = TokenType.PAT,
) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return { error: jsonError("Token name is required", 400) };
  }

  const existing = await prisma.personalAccessToken.findFirst({
    where: {
      userId,
      name: normalizedName,
    },
  });

  if (existing) {
    return { error: jsonError("A token with this name already exists", 409) };
  }

  const tokenValue = generateToken();
  const tokenHash = hashToken(tokenValue);
  const tokenPrefix = getTokenDisplayPrefix(tokenValue);

  let created;
  try {
    created = await withSerializableRetry(async () => {
      return prisma.$transaction(
        async (tx) => {
          const activeCount = await tx.personalAccessToken.count({
            where: {
              userId,
              status: TokenStatus.ACTIVE,
              expiresAt: {
                gt: new Date(),
              },
            },
          });

          if (activeCount >= getMaxActiveTokensPerUser()) {
            throw jsonError("You have reached the active token limit", 429);
          }

          return tx.personalAccessToken.create({
            data: {
              userId,
              name: normalizedName,
              tokenHash,
              tokenPrefix,
              type,
              expiresAt: buildExpiryDate(expiresInDays),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });
  } catch (error) {
    if (error instanceof Response) {
      return { error };
    }
    throw error;
  }

  return {
    token: {
      id: created.id,
      name: created.name,
      tokenValue,
      tokenPrefix: created.tokenPrefix,
      type: created.type,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    },
  };
}

export async function validateToken(tokenValue: string) {
  const tokenHash = hashToken(tokenValue);
  const tokenRecord = await prisma.personalAccessToken.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (!tokenRecord) {
    return null;
  }

  if (
    tokenRecord.status !== TokenStatus.ACTIVE ||
    tokenRecord.expiresAt < new Date()
  ) {
    return null;
  }

  if (
    tokenRecord.user.status === UserStatus.INACTIVE ||
    tokenRecord.user.status === UserStatus.PENDING_APPROVAL
  ) {
    return null;
  }

  return tokenRecord;
}

export async function listTokens(userId: string, showAll: boolean) {
  const tokens = await prisma.personalAccessToken.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return tokens
    .filter((token) => showAll || isTokenRecentlyVisible(token))
    .map(toTokenSummary);
}

export async function listAllTokens(options: {
  showAll: boolean;
  userId?: string | null;
}) {
  const tokens = await prisma.personalAccessToken.findMany({
    where: options.userId
      ? {
          userId: options.userId,
        }
      : undefined,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return tokens
    .filter((token) => options.showAll || isTokenRecentlyVisible(token))
    .map((token) => ({
      ...toTokenSummary(token),
      user: token.user,
    }));
}

export async function revokeToken(tokenId: string, userId: string) {
  const existing = await prisma.personalAccessToken.findFirst({
    where: {
      id: tokenId,
      userId,
    },
  });

  if (!existing) {
    return { error: jsonError("Token not found", 404) };
  }

  if (existing.status === TokenStatus.REVOKED) {
    return { error: jsonError("Token is already revoked", 409) };
  }

  const revokedAt = new Date();
  const token = await prisma.personalAccessToken.update({
    where: { id: existing.id },
    data: {
      status: TokenStatus.REVOKED,
      revokedAt,
    },
  });

  return {
    token: {
      id: token.id,
      status: token.status,
      revokedAt: token.revokedAt,
    },
  };
}

export async function renewToken(
  tokenId: string,
  userId: string,
  expiresInDays = getDefaultTokenExpiryDays(TokenType.PAT),
) {
  const existing = await prisma.personalAccessToken.findFirst({
    where: {
      id: tokenId,
      userId,
    },
  });

  if (!existing) {
    return { error: jsonError("Token not found", 404) };
  }

  if (existing.status === TokenStatus.REVOKED) {
    return { error: jsonError("Revoked tokens cannot be renewed", 409) };
  }

  const tokenValue = generateToken();
  const token = await prisma.personalAccessToken.update({
    where: { id: existing.id },
    data: {
      tokenHash: hashToken(tokenValue),
      tokenPrefix: getTokenDisplayPrefix(tokenValue),
      expiresAt: buildExpiryDate(expiresInDays),
      renewalCount: {
        increment: 1,
      },
      revokedAt: null,
    },
  });

  return {
    token: {
      id: token.id,
      name: token.name,
      tokenValue,
      tokenPrefix: token.tokenPrefix,
      expiresAt: token.expiresAt,
      renewalCount: token.renewalCount,
    },
  };
}

export async function deleteToken(tokenId: string, userId: string) {
  const existing = await prisma.personalAccessToken.findFirst({
    where: {
      id: tokenId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return { error: jsonError("Token not found", 404) };
  }

  await prisma.personalAccessToken.delete({
    where: {
      id: existing.id,
    },
  });

  return { ok: true as const };
}

export async function revokeTokenAsAdmin(tokenId: string) {
  const existing = await prisma.personalAccessToken.findUnique({
    where: {
      id: tokenId,
    },
  });

  if (!existing) {
    return { error: jsonError("Token not found", 404) };
  }

  if (existing.status === TokenStatus.REVOKED) {
    return { error: jsonError("Token is already revoked", 409) };
  }

  const token = await prisma.personalAccessToken.update({
    where: { id: tokenId },
    data: {
      status: TokenStatus.REVOKED,
      revokedAt: new Date(),
    },
  });

  return {
    token: {
      id: token.id,
      status: token.status,
      revokedAt: token.revokedAt,
    },
  };
}

export async function deleteTokenAsAdmin(tokenId: string) {
  const existing = await prisma.personalAccessToken.findUnique({
    where: {
      id: tokenId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return { error: jsonError("Token not found", 404) };
  }

  await prisma.personalAccessToken.delete({
    where: {
      id: tokenId,
    },
  });

  return { ok: true as const };
}

export async function touchTokenLastUsed(tokenId: string) {
  try {
    await prisma.personalAccessToken.update({
      where: { id: tokenId },
      data: {
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    tokenLogger.error("tokens.last_used_update_failed", { error, tokenId });
  }
}
