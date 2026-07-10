import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import {
  decryptGrantToken,
  encryptGrantToken,
  getFreshTeamsDelegatedAccessToken,
  saveTeamsDelegatedGrant,
} from "@/services/teams/consent";

describe("teams delegated grant token handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY;
  });

  it("encrypts and decrypts delegated grant tokens", () => {
    process.env.TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY =
      "test-key-for-delegated-grants";
    const encrypted = encryptGrantToken("secret-token-value");

    expect(encrypted).toContain("enc:v1:");
    expect(encrypted).not.toContain("secret-token-value");
    expect(decryptGrantToken(encrypted)).toBe("secret-token-value");
  });

  it("stores encrypted delegated grant tokens at rest", async () => {
    process.env.TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY =
      "test-key-for-delegated-grants";
    prismaMock.teamsDelegatedGrant.upsert.mockResolvedValue({
      id: "grant-1",
    } as never);

    await saveTeamsDelegatedGrant("user-1", {
      access_token: "access-plain",
      refresh_token: "refresh-plain",
      expires_in: 3600,
      scope: "offline_access ChannelMessage.Send",
    });

    expect(prismaMock.teamsDelegatedGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          accessToken: expect.stringContaining("enc:v1:"),
          refreshToken: expect.stringContaining("enc:v1:"),
        }),
      }),
    );
    expect(
      JSON.stringify(prismaMock.teamsDelegatedGrant.upsert.mock.calls[0][0]),
    ).not.toContain("access-plain");
  });

  it("returns decrypted access tokens for valid cached grants", async () => {
    process.env.TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY =
      "test-key-for-delegated-grants";
    const encrypted = encryptGrantToken("cached-access-token");
    prismaMock.teamsDelegatedGrant.findUnique.mockResolvedValue({
      accessToken: encrypted,
      refreshToken: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    } as never);

    const token = await getFreshTeamsDelegatedAccessToken("user-1");

    expect(token).toBe("cached-access-token");
  });
});
