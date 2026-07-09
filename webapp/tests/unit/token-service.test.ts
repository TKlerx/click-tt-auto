import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  TokenStatus,
  TokenType,
  UserStatus,
} from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import {
  countActiveTokens,
  createToken,
  generateToken,
  getDefaultTokenExpiryDays,
  getMaxActiveTokensPerUser,
  getTokenDisplayPrefix,
  hashToken,
  listTokens,
  touchTokenLastUsed,
  validateToken,
} from "@/services/api/tokens";

describe("token service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    process.env.PAT_TOKEN_PREFIX = "starter_pat";
    process.env.PAT_DEFAULT_EXPIRY_DAYS = "90";
    process.env.CLI_TOKEN_DEFAULT_EXPIRY_DAYS = "30";
    process.env.PAT_MAX_ACTIVE_PER_USER = "10";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete process.env.PAT_TOKEN_PREFIX;
    delete process.env.PAT_DEFAULT_EXPIRY_DAYS;
    delete process.env.CLI_TOKEN_DEFAULT_EXPIRY_DAYS;
    delete process.env.PAT_MAX_ACTIVE_PER_USER;
  });

  it("generates prefixed tokens and extracts the display prefix from the random segment", () => {
    const token = generateToken("starter_pat");

    expect(token).toMatch(/^starter_pat_[A-Za-z0-9_-]+$/);
    expect(getTokenDisplayPrefix("starter_pat_abcdefgh1234")).toBe("abcdefgh");
  });

  it("hashes tokens deterministically", () => {
    expect(hashToken("sample-token")).toBe(hashToken("sample-token"));
    expect(hashToken("sample-token")).not.toBe(hashToken("other-token"));
  });

  it("reads default expiry and token limits from the environment", () => {
    process.env.PAT_DEFAULT_EXPIRY_DAYS = "120";
    process.env.CLI_TOKEN_DEFAULT_EXPIRY_DAYS = "45";
    process.env.PAT_MAX_ACTIVE_PER_USER = "3";

    expect(getDefaultTokenExpiryDays(TokenType.PAT)).toBe(120);
    expect(getDefaultTokenExpiryDays(TokenType.CLI_LOGIN)).toBe(45);
    expect(getMaxActiveTokensPerUser()).toBe(3);
  });

  it("creates a token when the name is unique and the user is under the limit", async () => {
    prismaMock.personalAccessToken.findFirst.mockResolvedValue(null);
    prismaMock.personalAccessToken.count.mockResolvedValue(0);
    prismaMock.personalAccessToken.create.mockResolvedValue({
      id: "token-1",
      name: "My Script",
      tokenPrefix: "abcdefgh",
      type: TokenType.PAT,
      expiresAt: new Date("2026-07-09T12:00:00.000Z"),
      createdAt: new Date("2026-04-10T12:00:00.000Z"),
    } as never);

    const result = await createToken("user-1", "My Script", 90, TokenType.PAT);

    expect("error" in result).toBe(false);
    if (!("token" in result) || !result.token) {
      throw new Error("Expected token creation to succeed");
    }
    expect(result.token.name).toBe("My Script");
    expect(result.token.tokenValue).toMatch(/^starter_pat_/);
    expect(prismaMock.personalAccessToken.create).toHaveBeenCalled();
  });

  it("rejects duplicate token names for the same user", async () => {
    prismaMock.personalAccessToken.findFirst.mockResolvedValue({
      id: "existing-token",
    } as never);

    const result = await createToken("user-1", "duplicate");

    expect("error" in result).toBe(true);
    if (!("error" in result) || !result.error) {
      throw new Error("Expected duplicate token creation to fail");
    }
    expect(result.error.status).toBe(409);
  });

  it("rejects creation when the active token limit has been reached", async () => {
    prismaMock.personalAccessToken.findFirst.mockResolvedValue(null);
    prismaMock.personalAccessToken.count.mockResolvedValue(10);

    const result = await createToken("user-1", "limit-hit");

    expect("error" in result).toBe(true);
    if (!("error" in result) || !result.error) {
      throw new Error("Expected token limit enforcement to fail");
    }
    expect(result.error.status).toBe(429);
  });

  it("counts only active non-expired tokens", async () => {
    prismaMock.personalAccessToken.count.mockResolvedValue(4);

    await expect(countActiveTokens("user-1")).resolves.toBe(4);
    expect(prismaMock.personalAccessToken.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: TokenStatus.ACTIVE,
        expiresAt: {
          gt: new Date("2026-04-10T12:00:00.000Z"),
        },
      },
    });
  });

  it("rejects expired and inactive-user tokens during validation", async () => {
    prismaMock.personalAccessToken.findUnique
      .mockResolvedValueOnce({
        id: "expired-token",
        status: TokenStatus.ACTIVE,
        expiresAt: new Date("2026-04-09T12:00:00.000Z"),
        user: {
          status: UserStatus.ACTIVE,
        },
      } as never)
      .mockResolvedValueOnce({
        id: "inactive-user-token",
        status: TokenStatus.ACTIVE,
        expiresAt: new Date("2026-05-10T12:00:00.000Z"),
        user: {
          status: UserStatus.INACTIVE,
        },
      } as never);

    await expect(validateToken("expired")).resolves.toBeNull();
    await expect(validateToken("inactive")).resolves.toBeNull();
  });

  it("lists recent tokens by default and includes older revoked entries when showAll is enabled", async () => {
    prismaMock.personalAccessToken.findMany.mockResolvedValue([
      {
        id: "active-token",
        name: "Active",
        tokenPrefix: "active123",
        type: TokenType.PAT,
        status: TokenStatus.ACTIVE,
        expiresAt: new Date("2026-05-10T12:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
        renewalCount: 0,
        createdAt: new Date("2026-04-08T12:00:00.000Z"),
      },
      {
        id: "old-revoked",
        name: "Old Revoked",
        tokenPrefix: "revoked1",
        type: TokenType.PAT,
        status: TokenStatus.REVOKED,
        expiresAt: new Date("2026-03-01T12:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: new Date("2025-12-01T12:00:00.000Z"),
        renewalCount: 1,
        createdAt: new Date("2025-11-30T12:00:00.000Z"),
      },
    ] as never);

    const recentOnly = await listTokens("user-1", false);
    const allTokens = await listTokens("user-1", true);

    expect(recentOnly).toHaveLength(1);
    expect(allTokens).toHaveLength(2);
  });

  it("logs last-used update failures as structured operational events", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.personalAccessToken.update.mockRejectedValue(
      new Error("db unavailable"),
    );

    await touchTokenLastUsed("token-1");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      event: "tokens.last_used_update_failed",
      component: "tokens",
      tokenId: "token-1",
    });
  });
});
