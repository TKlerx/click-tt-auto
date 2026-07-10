import { afterEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "../../../../generated/prisma/enums";

const { getSessionUser, checkScopeAccess, resolveTokenUser } = vi.hoisted(
  () => ({
    getSessionUser: vi.fn(),
    checkScopeAccess: vi.fn(),
    resolveTokenUser: vi.fn(),
  }),
);

vi.mock("@/lib/auth", () => ({
  getSessionUser,
}));

vi.mock("@/lib/token-auth", () => ({
  resolveTokenUser,
}));

vi.mock("@/lib/rbac", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return {
    ...actual,
    checkScopeAccess,
  };
});

import {
  authorizeRouteContext,
  requireRouteUser,
  requireRouteUserWithRoles,
} from "@/services/api/route-context";

describe("route context service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without an authenticated user", async () => {
    getSessionUser.mockResolvedValue(null);
    resolveTokenUser.mockResolvedValue(null);

    const result = await requireRouteUser();

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(401);
    }
  });

  it("enforces role checks", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });

    const result = await requireRouteUserWithRoles([Role.PLATFORM_ADMIN]);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
    }
  });

  it("falls back to token authentication when no session is present", async () => {
    getSessionUser.mockResolvedValue(null);
    resolveTokenUser.mockResolvedValue({
      id: "user-2",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    });

    const result = await requireRouteUser(
      new Request("http://localhost/api/users"),
    );

    expect(result).toMatchObject({
      user: {
        id: "user-2",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    expect(resolveTokenUser).toHaveBeenCalled();
  });

  it("enforces scope-restricted access", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });
    checkScopeAccess.mockResolvedValue(true);

    const result = await authorizeRouteContext(
      new Request("http://localhost/api/test?scopeId=scope-1"),
      {
        roles: [Role.SCOPE_USER],
        scopeRestricted: true,
      },
    );

    expect(result).toMatchObject({
      user: {
        id: "user-1",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      },
    });
    expect(checkScopeAccess).toHaveBeenCalledWith(
      {
        id: "user-1",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      },
      "scope-1",
    );
  });

  it("returns 400 when a required scope is missing", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_ADMIN,
      status: UserStatus.ACTIVE,
    });

    const result = await authorizeRouteContext(
      new Request("http://localhost/api/test"),
      {
        roles: [Role.SCOPE_ADMIN],
        scopeRestricted: true,
      },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });
});
