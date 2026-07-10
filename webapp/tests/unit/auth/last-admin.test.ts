import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../../generated/prisma/enums";

const { requireRouteUserWithRoles } = vi.hoisted(() => ({
  requireRouteUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/services/api/route-context", () => ({
  requireRouteUserWithRoles,
}));

import { PATCH as rolePatch } from "@/app/api/users/[id]/role/route";
import { PATCH as deactivatePatch } from "@/app/api/users/[id]/deactivate/route";
import { PATCH as approvePatch } from "@/app/api/users/[id]/approve/route";

describe("last admin protection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );
  });

  it("rejects demoting the last active admin", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin_1",
      role: Role.PLATFORM_ADMIN,
    } as never);
    prismaMock.user.count.mockResolvedValue(1);

    const response = await rolePatch(
      new Request("http://localhost/api/users/admin_1/role", {
        method: "PATCH",
        body: JSON.stringify({ role: Role.SCOPE_USER }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "admin_1" }) },
    );

    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot change role of the last Admin user",
    });
  });

  it("rejects deactivating the last active admin", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin_1",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    } as never);
    prismaMock.user.count.mockResolvedValue(1);

    const response = await deactivatePatch(
      new Request("http://localhost/api/users/admin_1/deactivate", {
        method: "PATCH",
      }),
      {
        params: Promise.resolve({ id: "admin_1" }),
      },
    );

    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot deactivate the last Admin user",
    });
  });

  it("does not treat pending admins as usable admins", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin_1",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    } as never);
    prismaMock.user.count.mockResolvedValue(1);

    const response = await rolePatch(
      new Request("http://localhost/api/users/admin_1/role", {
        method: "PATCH",
        body: JSON.stringify({ role: Role.SCOPE_ADMIN }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "admin_1" }) },
    );

    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot change role of the last Admin user",
    });
  });

  it("retries on serializable conflict for role change", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin_2", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin_1",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    } as never);
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.user.update.mockResolvedValue({
      id: "admin_1",
      role: Role.SCOPE_USER,
    } as never);

    let calls = 0;
    prismaMock.$transaction.mockImplementation(async (callback) => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("serialization conflict");
        (error as { code?: string }).code = "P2034";
        throw error;
      }
      return callback(prismaMock);
    });

    const response = await rolePatch(
      new Request("http://localhost/api/users/admin_1/role", {
        method: "PATCH",
        body: JSON.stringify({ role: Role.SCOPE_USER }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "admin_1" }) },
    );

    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("forwards the incoming request for role checks", async () => {
    const request = new Request("http://localhost/api/users/admin_1/role", {
      method: "PATCH",
      body: JSON.stringify({ role: Role.SCOPE_USER }),
      headers: { "Content-Type": "application/json" },
    });

    requireRouteUserWithRoles.mockResolvedValue({
      error: new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
      }),
    });

    const response = await rolePatch(request, {
      params: Promise.resolve({ id: "admin_1" }),
    });

    expect(response?.status).toBe(401);
    expect(requireRouteUserWithRoles).toHaveBeenCalledWith(
      [Role.PLATFORM_ADMIN],
      request,
    );
  });

  it("uses fresh status for approval precondition checks", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "user_1",
        role: Role.SCOPE_USER,
        status: UserStatus.PENDING_APPROVAL,
      } as never)
      .mockResolvedValueOnce({
        id: "user_1",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      } as never);

    const response = await approvePatch(
      new Request("http://localhost/api/users/user_1/approve", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: "user_1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "User is not in pending approval status",
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
