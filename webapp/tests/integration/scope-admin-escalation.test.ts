import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const auth = vi.hoisted(() => ({
  requireRouteUserWithRoles: vi.fn(),
  requireApiUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ safeLogAudit: vi.fn() }));
vi.mock("@/services/notifications/service", () => ({
  safeQueueRoleChangedNotifications: vi.fn(),
  safeQueueUserCreatedNotifications: vi.fn(),
  safeQueueUserStatusChangedNotifications: vi.fn(),
}));
vi.mock("@/services/api/route-context", () => ({
  requireRouteUserWithRoles: auth.requireRouteUserWithRoles,
}));
vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles: auth.requireApiUserWithRoles,
}));

import { POST as grantScope } from "@/app/api/users/[id]/scopes/route";
import { PATCH as updateRole } from "@/app/api/users/[id]/role/route";
import { GET as listUsers } from "@/app/api/users/route";

describe("scope admin escalation", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );
    auth.requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "actor", role: Role.SCOPE_ADMIN, status: UserStatus.ACTIVE },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses granting a scope the actor does not hold", async () => {
    prismaMock.user.findUnique.mockResolvedValue(targetUser() as never);
    prismaMock.scope.findUnique.mockResolvedValue(scope("KOELN") as never);
    prismaMock.userScopeAssignment.findMany.mockResolvedValue([
      { scopeId: "scope-OWL" },
    ] as never);

    const response = await grantScope(jsonRequest({ scopeId: "scope-KOELN" }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(response.status).toBe(403);
    expect(prismaMock.userScopeAssignment.upsert).not.toHaveBeenCalled();
  });

  it("refuses self assignment", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "actor",
      role: Role.SCOPE_USER,
    } as never);
    prismaMock.scope.findUnique.mockResolvedValue(scope("OWL") as never);

    const response = await grantScope(jsonRequest({ scopeId: "scope-OWL" }), {
      params: Promise.resolve({ id: "actor" }),
    });

    expect(response.status).toBe(403);
    expect(prismaMock.userScopeAssignment.upsert).not.toHaveBeenCalled();
  });

  it("refuses platform admin role escalation", async () => {
    prismaMock.user.findUnique.mockResolvedValue(targetUser() as never);

    const result = await updateRole(
      jsonRequest({ role: Role.PLATFORM_ADMIN }),
      { params: Promise.resolve({ id: "target" }) },
    );

    expect(result.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses demoting a platform admin", async () => {
    // canAssignRole guards only the destination role, so a scope admin could
    // otherwise strip a platform admin by moving them down to SCOPE_USER.
    prismaMock.user.findUnique.mockResolvedValue({
      id: "target",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    } as never);

    const result = await updateRole(jsonRequest({ role: Role.SCOPE_USER }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(result.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses demoting a target promoted after the initial lookup", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(targetUser() as never)
      .mockResolvedValueOnce({
        id: "target",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      } as never);

    const result = await updateRole(jsonRequest({ role: Role.SCOPE_USER }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(result.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses a role change for a user outside the actor's scopes", async () => {
    prismaMock.user.findUnique.mockResolvedValue(targetUser() as never);
    prismaMock.userScopeAssignment.findMany.mockResolvedValue([
      { scopeId: "scope-owl" },
    ] as never);
    prismaMock.userScopeAssignment.findFirst.mockResolvedValue(null as never);

    const result = await updateRole(jsonRequest({ role: Role.SCOPE_ADMIN }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(result.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("allows a role change for a user within the actor's scopes", async () => {
    prismaMock.user.findUnique.mockResolvedValue(targetUser() as never);
    prismaMock.userScopeAssignment.findMany.mockResolvedValue([
      { scopeId: "scope-owl" },
    ] as never);
    prismaMock.userScopeAssignment.findFirst.mockResolvedValue({
      scopeId: "scope-owl",
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: "target",
      role: Role.SCOPE_ADMIN,
    } as never);

    const result = await updateRole(jsonRequest({ role: Role.SCOPE_ADMIN }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(result.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: Role.SCOPE_ADMIN } }),
    );
  });

  it("refuses listing users for scope admins", async () => {
    auth.requireApiUserWithRoles.mockResolvedValue({
      error: Response.json({ error: "Not authorized" }, { status: 403 }),
    });

    const response = await listUsers(new Request("http://localhost/api/users"));

    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function targetUser() {
  return { id: "target", role: Role.SCOPE_USER, status: UserStatus.ACTIVE };
}

function scope(code: string) {
  return {
    id: `scope-${code}`,
    code,
    name: code,
    parent: {
      code: "WTTV",
      name: "WTTV",
      parent: { code: "DE", name: "Germany" },
    },
  };
}
