import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireRouteUserWithRoles } = vi.hoisted(() => ({
  requireRouteUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/services/api/route-context", () => ({ requireRouteUserWithRoles }));

import { GET as lookupUser } from "@/app/api/users/lookup/route";

describe("user lookup", () => {
  beforeEach(() => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "actor", role: Role.SCOPE_ADMIN, status: UserStatus.ACTIVE },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns one exact email match", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      user("target@example.com") as never,
    );

    const response = await lookupUser(
      new Request("http://localhost/api/users/lookup?email=target@example.com"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { email: "target@example.com" },
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "target@example.com" } }),
    );
  });

  it("does not do prefix lookup", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const response = await lookupUser(
      new Request("http://localhost/api/users/lookup?email=target"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "target" } }),
    );
  });

  it("returns the same empty result for users the actor may not act on", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      user("admin@example.com", Role.PLATFORM_ADMIN) as never,
    );

    const response = await lookupUser(
      new Request("http://localhost/api/users/lookup?email=admin@example.com"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null });
  });

  it("shows a scope admin only the target's scopes they hold (FR-042)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      user("target@example.com", Role.SCOPE_USER, [
        assignment("scope-owl", "OWL"),
        assignment("scope-koeln", "KOELN"),
      ]) as never,
    );
    // The actor holds OWL only.
    prismaMock.userScopeAssignment.findMany.mockResolvedValue([
      { scopeId: "scope-owl" },
    ] as never);

    const response = await lookupUser(
      new Request("http://localhost/api/users/lookup?email=target@example.com"),
    );

    const body = await response.json();
    expect(body.user.scopes.map((scope: { code: string }) => scope.code)).toEqual([
      "OWL",
    ]);
  });

  it("shows a platform admin every scope the target holds", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "actor", role: Role.PLATFORM_ADMIN, status: UserStatus.ACTIVE },
    });
    prismaMock.user.findUnique.mockResolvedValue(
      user("target@example.com", Role.SCOPE_USER, [
        assignment("scope-owl", "OWL"),
        assignment("scope-koeln", "KOELN"),
      ]) as never,
    );

    const response = await lookupUser(
      new Request("http://localhost/api/users/lookup?email=target@example.com"),
    );

    const body = await response.json();
    expect(body.user.scopes.map((scope: { code: string }) => scope.code)).toEqual([
      "OWL",
      "KOELN",
    ]);
    // No per-actor scope filtering query for a platform admin.
    expect(prismaMock.userScopeAssignment.findMany).not.toHaveBeenCalled();
  });
});

function assignment(scopeId: string, code: string) {
  return {
    scopeId,
    scope: {
      id: scopeId,
      code,
      name: code,
      parent: {
        code: "WTTV",
        name: "WTTV",
        parent: { code: "DE", name: "Germany" },
      },
    },
  };
}

function user(
  email: string,
  role: Role = Role.SCOPE_USER,
  scopeAssignments: ReturnType<typeof assignment>[] = [],
) {
  return {
    id: "target",
    email,
    name: "Target",
    role,
    status: UserStatus.ACTIVE,
    authMethod: "LOCAL",
    scopeAssignments,
  };
}
