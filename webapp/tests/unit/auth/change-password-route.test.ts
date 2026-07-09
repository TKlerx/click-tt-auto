import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { __resetRateLimitStore } from "@/lib/rate-limit";

const {
  requireApiUser,
  getPasswordComplexityErrorMessage,
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
} = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  getPasswordComplexityErrorMessage: vi.fn(
    () => "Password must contain test requirements.",
  ),
  hashPassword: vi.fn(),
  validatePasswordComplexity: vi.fn(),
  verifyPassword: vi.fn(),
}));

const { revokeOtherSessions } = vi.hoisted(() => ({
  revokeOtherSessions: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth", () => ({
  getPasswordComplexityErrorMessage,
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/lib/better-auth", () => ({
  auth: {
    api: {
      revokeOtherSessions,
    },
  },
}));

import { POST } from "@/app/api/auth/change-password/route";

describe("change password route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    __resetRateLimitStore();
  });

  it("updates the credential account password and revokes other sessions", async () => {
    requireApiUser.mockResolvedValue({
      user: { id: "user-1", email: "member@example.com" },
    });
    validatePasswordComplexity.mockReturnValue(true);
    prismaMock.account.findUnique.mockResolvedValue({
      password: "stored-hash",
    } as never);
    verifyPassword.mockResolvedValue(true);
    hashPassword.mockResolvedValue("new-hash");
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.account.update.mockResolvedValue({} as never);
    prismaMock.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as unknown as Promise<unknown>[]),
    );
    revokeOtherSessions.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "TempPass123",
          newPassword: "NewPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: "member@example.com",
        },
      },
      select: {
        password: true,
      },
    });
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: "member@example.com",
        },
      },
      data: {
        password: "new-hash",
      },
    });
    expect(revokeOtherSessions).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(200);
  });

  it("rejects users without a local credential account", async () => {
    requireApiUser.mockResolvedValue({
      user: { id: "user-1", email: "member@example.com" },
    });
    validatePasswordComplexity.mockReturnValue(true);
    prismaMock.account.findUnique.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "TempPass123",
          newPassword: "NewPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(verifyPassword).not.toHaveBeenCalled();
    expect(revokeOtherSessions).not.toHaveBeenCalled();
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password change is only available for local accounts",
    });
  });

  it("returns explicit complexity requirements for weak passwords", async () => {
    requireApiUser.mockResolvedValue({
      user: { id: "user-1", email: "member@example.com" },
    });
    validatePasswordComplexity.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "TempPass123",
          newPassword: "weak",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(getPasswordComplexityErrorMessage).toHaveBeenCalled();
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password must contain test requirements.",
    });
  });

  it("does not consume a shared unauthenticated rate-limit bucket", async () => {
    requireApiUser.mockResolvedValue({
      error: new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
      }),
    });

    for (let index = 0; index < 10; index += 1) {
      const response = await POST(
        new Request("http://localhost/api/auth/change-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: "TempPass123",
            newPassword: "NewPass123",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(response?.status).toBe(401);
    }
  });
});
