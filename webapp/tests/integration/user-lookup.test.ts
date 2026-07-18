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
});

function user(email: string, role: Role = Role.SCOPE_USER) {
  return {
    id: "target",
    email,
    name: "Target",
    role,
    status: UserStatus.ACTIVE,
    authMethod: "LOCAL",
    scopeAssignments: [],
  };
}
