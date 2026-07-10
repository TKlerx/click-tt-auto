import { afterEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "../../../generated/prisma/enums";

const { getSessionUser, checkScopeAccess } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  checkScopeAccess: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser,
}));

vi.mock("@/lib/rbac", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return {
    ...actual,
    checkScopeAccess,
  };
});

import { authorizeRoute } from "@/lib/route-auth";

describe("authorizeRoute", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without an authenticated user", async () => {
    getSessionUser.mockResolvedValue(null);

    const result = await authorizeRoute(
      new Request("http://localhost/api/test"),
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      const response = result.error!;
      expect(response.status).toBe(401);
    }
  });

  it("enforces role checks", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });

    const result = await authorizeRoute(
      new Request("http://localhost/api/test"),
      {
        roles: [Role.PLATFORM_ADMIN],
      },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      const response = result.error!;
      expect(response.status).toBe(403);
    }
  });

  it("enforces scope-restricted access", async () => {
    getSessionUser.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    });
    checkScopeAccess.mockResolvedValue(true);

    const result = await authorizeRoute(
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

    const result = await authorizeRoute(
      new Request("http://localhost/api/test"),
      {
        roles: [Role.SCOPE_ADMIN],
        scopeRestricted: true,
      },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      const response = result.error!;
      expect(response.status).toBe(400);
    }
  });
});
