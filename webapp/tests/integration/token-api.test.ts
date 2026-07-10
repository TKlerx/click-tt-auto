import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  Role,
  ThemePreference,
  TokenStatus,
  TokenType,
  UserStatus,
} from "../../generated/prisma/enums";

const { getSessionUser, safeLogAudit } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  safeLogAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser,
}));

vi.mock("@/lib/audit", () => ({
  safeLogAudit,
}));

import {
  GET as getBackgroundJobs,
  POST as postBackgroundJobs,
} from "@/app/api/background-jobs/route";
import { GET as getAuthMe } from "@/app/api/auth/me/route";
import { GET as getAdminTokens } from "@/app/api/admin/tokens/route";
import { DELETE as deleteAdminToken } from "@/app/api/admin/tokens/[id]/route";
import { POST as revokeAdminToken } from "@/app/api/admin/tokens/[id]/revoke/route";
import { GET as getTokens, POST as postTokens } from "@/app/api/tokens/route";
import { DELETE as deleteToken } from "@/app/api/tokens/[id]/route";
import { POST as renewToken } from "@/app/api/tokens/[id]/renew/route";
import { POST as revokeToken } from "@/app/api/tokens/[id]/revoke/route";

describe("token API integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    process.env.PAT_TOKEN_PREFIX = "starter_pat";
    process.env.PAT_MAX_ACTIVE_PER_USER = "10";
    process.env.PAT_DEFAULT_EXPIRY_DAYS = "90";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete process.env.PAT_TOKEN_PREFIX;
    delete process.env.PAT_MAX_ACTIVE_PER_USER;
    delete process.env.PAT_DEFAULT_EXPIRY_DAYS;
  });

  it("creates a PAT and returns the token value once", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      themePreference: ThemePreference.LIGHT,
    });
    prismaMock.personalAccessToken.findFirst.mockResolvedValue(null);
    prismaMock.personalAccessToken.count.mockResolvedValue(0);
    prismaMock.personalAccessToken.create.mockResolvedValue({
      id: "token-1",
      name: "My Script",
      tokenPrefix: "abcdef12",
      type: TokenType.PAT,
      expiresAt: new Date("2026-07-09T12:00:00.000Z"),
      createdAt: new Date("2026-04-10T12:00:00.000Z"),
    } as never);

    const response = await postTokens(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "My Script",
          expiresInDays: 90,
        }),
      }),
    );

    if (!response) {
      throw new Error("Expected token creation response");
    }
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      token: {
        id: "token-1",
        name: "My Script",
        tokenPrefix: "abcdef12",
        type: TokenType.PAT,
      },
    });
    expect(safeLogAudit).toHaveBeenCalled();
  });

  it("rejects duplicate token names and active token limits", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });
    prismaMock.personalAccessToken.findFirst.mockResolvedValueOnce({
      id: "existing",
    } as never);

    const duplicateResponse = await postTokens(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Existing", expiresInDays: 90 }),
      }),
    );

    if (!duplicateResponse) {
      throw new Error("Expected duplicate token response");
    }
    expect(duplicateResponse.status).toBe(409);

    prismaMock.personalAccessToken.findFirst.mockResolvedValueOnce(null);
    prismaMock.personalAccessToken.count.mockResolvedValueOnce(10);

    const limitResponse = await postTokens(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Limit Hit", expiresInDays: 90 }),
      }),
    );

    if (!limitResponse) {
      throw new Error("Expected token limit response");
    }
    expect(limitResponse.status).toBe(429);
  });

  it("lists tokens and supports showAll filtering", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });
    prismaMock.personalAccessToken.findMany.mockResolvedValue([
      {
        id: "token-1",
        name: "Visible Token",
        tokenPrefix: "visible1",
        type: TokenType.PAT,
        status: TokenStatus.ACTIVE,
        expiresAt: new Date("2026-05-10T12:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
        renewalCount: 0,
        createdAt: new Date("2026-04-09T12:00:00.000Z"),
      },
      {
        id: "token-2",
        name: "Old Token",
        tokenPrefix: "oldtokn2",
        type: TokenType.PAT,
        status: TokenStatus.REVOKED,
        expiresAt: new Date("2025-11-10T12:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: new Date("2025-11-11T12:00:00.000Z"),
        renewalCount: 2,
        createdAt: new Date("2025-11-01T12:00:00.000Z"),
      },
    ] as never);

    const filteredResponse = await getTokens(
      new Request("http://localhost/api/tokens"),
    );
    const allResponse = await getTokens(
      new Request("http://localhost/api/tokens?showAll=true"),
    );

    await expect(filteredResponse.json()).resolves.toMatchObject({
      tokens: [{ id: "token-1" }],
    });
    await expect(allResponse.json()).resolves.toMatchObject({
      tokens: [{ id: "token-1" }, { id: "token-2" }],
    });
  });

  it("authenticates an existing API route with a Bearer token and rejects invalid token states", async () => {
    getSessionUser.mockResolvedValue(null);
    prismaMock.personalAccessToken.findUnique.mockResolvedValueOnce({
      id: "token-1",
      status: TokenStatus.ACTIVE,
      expiresAt: new Date("2026-05-10T12:00:00.000Z"),
      user: {
        id: "user-1",
        email: "member@example.com",
        name: "Member",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
        themePreference: ThemePreference.LIGHT,
        mustChangePassword: false,
        authMethod: "LOCAL",
      },
    } as never);
    prismaMock.backgroundJob.findMany.mockResolvedValueOnce([
      {
        id: "job-1",
        jobType: "noop",
        status: "COMPLETED",
        payload: "{}",
        result: '{"ok":true}',
        error: null,
        attemptCount: 1,
        availableAt: new Date("2026-04-10T12:00:00.000Z"),
        startedAt: null,
        finishedAt: null,
        workerId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-04-10T12:00:00.000Z"),
        updatedAt: new Date("2026-04-10T12:00:00.000Z"),
      },
    ] as never);
    prismaMock.personalAccessToken.update.mockResolvedValue({} as never);

    const validResponse = await getBackgroundJobs(
      new Request("http://localhost/api/background-jobs", {
        headers: {
          authorization: "Bearer starter_pat_validtoken",
        },
      }),
    );

    expect(validResponse.status).toBe(200);
    await expect(validResponse.json()).resolves.toMatchObject({
      jobs: [{ id: "job-1", createdByUserId: "user-1" }],
    });

    prismaMock.personalAccessToken.findUnique.mockResolvedValueOnce({
      id: "token-1",
      status: TokenStatus.ACTIVE,
      expiresAt: new Date("2026-05-10T12:00:00.000Z"),
      user: {
        id: "user-1",
        email: "member@example.com",
        name: "Member",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
        themePreference: ThemePreference.LIGHT,
        mustChangePassword: false,
        authMethod: "LOCAL",
      },
    } as never);
    prismaMock.personalAccessToken.update.mockResolvedValue({} as never);

    const meResponse = await getAuthMe(
      new Request("http://localhost/api/auth/me", {
        headers: {
          authorization: "Bearer starter_pat_validtoken",
        },
      }),
    );

    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toMatchObject({
      user: {
        id: "user-1",
        email: "member@example.com",
        name: "Member",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      },
    });

    prismaMock.personalAccessToken.findUnique.mockResolvedValueOnce({
      id: "expired-token",
      status: TokenStatus.ACTIVE,
      expiresAt: new Date("2026-04-09T12:00:00.000Z"),
      user: {
        id: "user-1",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      },
    } as never);

    const expiredResponse = await getBackgroundJobs(
      new Request("http://localhost/api/background-jobs", {
        headers: {
          authorization: "Bearer starter_pat_expired",
        },
      }),
    );

    expect(expiredResponse.status).toBe(401);

    prismaMock.personalAccessToken.findUnique.mockResolvedValueOnce({
      id: "revoked-token",
      status: TokenStatus.REVOKED,
      expiresAt: new Date("2026-05-10T12:00:00.000Z"),
      user: {
        id: "user-1",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      },
    } as never);

    const revokedResponse = await getBackgroundJobs(
      new Request("http://localhost/api/background-jobs", {
        headers: {
          authorization: "Bearer starter_pat_revoked",
        },
      }),
    );

    expect(revokedResponse.status).toBe(401);
  });

  it("enforces route RBAC for PAT-authenticated requests", async () => {
    getSessionUser.mockResolvedValue(null);
    prismaMock.personalAccessToken.findUnique.mockResolvedValue({
      id: "token-1",
      status: TokenStatus.ACTIVE,
      expiresAt: new Date("2026-05-10T12:00:00.000Z"),
      user: {
        id: "user-1",
        email: "member@example.com",
        name: "Member",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
        themePreference: ThemePreference.LIGHT,
        mustChangePassword: false,
        authMethod: "LOCAL",
      },
    } as never);
    prismaMock.personalAccessToken.update.mockResolvedValue({} as never);

    const response = await postBackgroundJobs(
      new Request("http://localhost/api/background-jobs", {
        method: "POST",
        headers: {
          authorization: "Bearer starter_pat_validtoken",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jobType: "noop",
          payload: {},
        }),
      }),
    );

    if (!response) {
      throw new Error("Expected RBAC response");
    }
    expect(response.status).toBe(403);
  });

  it("supports revoke, renew, and delete for user-owned tokens", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });

    prismaMock.personalAccessToken.findFirst
      .mockResolvedValueOnce({
        id: "token-1",
        userId: "user-1",
        status: TokenStatus.ACTIVE,
      } as never)
      .mockResolvedValueOnce({
        id: "token-1",
        userId: "user-1",
        status: TokenStatus.ACTIVE,
        name: "Script Token",
      } as never)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "token-1",
        userId: "user-1",
      } as never);

    prismaMock.personalAccessToken.update
      .mockResolvedValueOnce({
        id: "token-1",
        status: TokenStatus.REVOKED,
        revokedAt: new Date("2026-04-10T12:00:00.000Z"),
      } as never)
      .mockResolvedValueOnce({
        id: "token-1",
        name: "Script Token",
        tokenPrefix: "renewed12",
        expiresAt: new Date("2026-07-09T12:00:00.000Z"),
        renewalCount: 1,
      } as never);

    const revokeResponse = await revokeToken(
      new Request("http://localhost/api/tokens/token-1/revoke"),
      {
        params: Promise.resolve({ id: "token-1" }),
      },
    );
    if (!revokeResponse) {
      throw new Error("Expected revoke response");
    }
    expect(revokeResponse.status).toBe(200);

    const renewResponse = await renewToken(
      new Request("http://localhost/api/tokens/token-1/renew", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresInDays: 90 }),
      }),
      { params: Promise.resolve({ id: "token-1" }) },
    );
    if (!renewResponse) {
      throw new Error("Expected renew response");
    }
    expect(renewResponse.status).toBe(200);
    await expect(renewResponse.json()).resolves.toMatchObject({
      token: { tokenPrefix: "renewed12", renewalCount: 1 },
    });

    const missingRevokeResponse = await revokeToken(
      new Request("http://localhost/api/tokens/missing/revoke"),
      {
        params: Promise.resolve({ id: "missing" }),
      },
    );
    if (!missingRevokeResponse) {
      throw new Error("Expected missing revoke response");
    }
    expect(missingRevokeResponse.status).toBe(404);

    prismaMock.personalAccessToken.delete.mockResolvedValueOnce({
      id: "token-1",
    } as never);

    const deleteResponse = await deleteToken(
      new Request("http://localhost/api/tokens/token-1"),
      {
        params: Promise.resolve({ id: "token-1" }),
      },
    );
    if (!deleteResponse) {
      throw new Error("Expected delete response");
    }
    expect(deleteResponse.status).toBe(204);
  });

  it("supports admin token listing, filtering, revoke, delete, and rejects non-admins", async () => {
    getSessionUser.mockResolvedValue({
      id: "admin-1",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    });
    prismaMock.personalAccessToken.findMany.mockResolvedValue([
      {
        id: "token-1",
        name: "Admin Visible",
        tokenPrefix: "prefix01",
        type: TokenType.PAT,
        status: TokenStatus.ACTIVE,
        expiresAt: new Date("2026-05-10T12:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
        renewalCount: 0,
        createdAt: new Date("2026-04-10T12:00:00.000Z"),
        user: {
          id: "user-2",
          name: "Scoped User",
          email: "user@example.com",
        },
      },
    ] as never);
    prismaMock.personalAccessToken.findUnique
      .mockResolvedValueOnce({
        id: "token-1",
        status: TokenStatus.ACTIVE,
      } as never)
      .mockResolvedValueOnce({
        id: "token-1",
      } as never);
    prismaMock.personalAccessToken.update.mockResolvedValueOnce({
      id: "token-1",
      status: TokenStatus.REVOKED,
      revokedAt: new Date("2026-04-10T12:00:00.000Z"),
    } as never);
    prismaMock.personalAccessToken.delete.mockResolvedValueOnce({
      id: "token-1",
    } as never);

    const listResponse = await getAdminTokens(
      new Request(
        "http://localhost/api/admin/tokens?showAll=true&userId=user-2",
      ),
    );
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      tokens: [{ id: "token-1", user: { id: "user-2" } }],
    });
    expect(prismaMock.personalAccessToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-2",
        },
      }),
    );

    const revokeResponse = await revokeAdminToken(
      new Request("http://localhost/api/admin/tokens/token-1/revoke"),
      { params: Promise.resolve({ id: "token-1" }) },
    );
    if (!revokeResponse) {
      throw new Error("Expected admin revoke response");
    }
    expect(revokeResponse.status).toBe(200);

    const deleteResponse = await deleteAdminToken(
      new Request("http://localhost/api/admin/tokens/token-1"),
      { params: Promise.resolve({ id: "token-1" }) },
    );
    if (!deleteResponse) {
      throw new Error("Expected admin delete response");
    }
    expect(deleteResponse.status).toBe(204);

    getSessionUser.mockResolvedValueOnce({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });

    const forbiddenResponse = await getAdminTokens(
      new Request("http://localhost/api/admin/tokens"),
    );
    expect(forbiddenResponse.status).toBe(403);
  });
});
