import { describe, expect, it } from "vitest";
import {
  canAssignRole,
  mayManageScopeAssignment,
  mayManageUserRole,
} from "@/lib/rbac";
import { Role } from "../../../generated/prisma/enums";

const owl = "scope-owl";
const koeln = "scope-koeln";
const germany = "scope-de";

const shareScopes = async () => true;
const shareNoScopes = async () => false;

describe("scope assignment authorization", () => {
  it("allows a scope admin to grant a held scope", async () => {
    await expect(
      mayManageScopeAssignment(
        { id: "actor", role: Role.SCOPE_ADMIN },
        { id: "target", role: Role.SCOPE_USER },
        owl,
        async () => [owl],
      ),
    ).resolves.toBe(true);
  });

  it("refuses scopes the actor does not hold", async () => {
    await expect(
      mayManageScopeAssignment(
        { id: "actor", role: Role.SCOPE_ADMIN },
        { id: "target", role: Role.SCOPE_USER },
        koeln,
        async () => [owl],
      ),
    ).resolves.toBe(false);
  });

  it("refuses platform-admin targets for scope admins", () => {
    expect(canAssignRole({ role: Role.SCOPE_ADMIN }, Role.PLATFORM_ADMIN)).toBe(
      false,
    );
  });

  it("refuses self-assignment", async () => {
    await expect(
      mayManageScopeAssignment(
        { id: "actor", role: Role.SCOPE_ADMIN },
        { id: "actor", role: Role.SCOPE_USER },
        owl,
        async () => [owl],
      ),
    ).resolves.toBe(false);
  });

  it("allows platform admins to manage any assignable scope", async () => {
    await expect(
      mayManageScopeAssignment(
        { id: "actor", role: Role.PLATFORM_ADMIN },
        { id: "target", role: Role.SCOPE_USER },
        koeln,
        async () => [],
      ),
    ).resolves.toBe(true);
  });

  it("refuses unassignable scopes for everyone", async () => {
    await expect(
      mayManageScopeAssignment(
        { id: "actor", role: Role.PLATFORM_ADMIN },
        { id: "target", role: Role.SCOPE_USER },
        germany,
        async () => [],
        async () => false,
      ),
    ).resolves.toBe(false);
  });
});

describe("user role management authorization", () => {
  const scopeAdmin = { id: "actor", role: Role.SCOPE_ADMIN };

  it("lets a scope admin set a shared-scope user's role within their rank", async () => {
    await expect(
      mayManageUserRole(
        scopeAdmin,
        { id: "target", role: Role.SCOPE_USER },
        Role.SCOPE_ADMIN,
        shareScopes,
      ),
    ).resolves.toBe(true);
  });

  it("refuses raising a role above the actor's own", async () => {
    await expect(
      mayManageUserRole(
        scopeAdmin,
        { id: "target", role: Role.SCOPE_USER },
        Role.PLATFORM_ADMIN,
        shareScopes,
      ),
    ).resolves.toBe(false);
  });

  it("refuses demoting a user ranked above the actor", async () => {
    // The exploit: canAssignRole guards only the destination role, so without
    // the target-rank check a scope admin could strip a platform admin.
    await expect(
      mayManageUserRole(
        scopeAdmin,
        { id: "target", role: Role.PLATFORM_ADMIN },
        Role.SCOPE_USER,
        shareScopes,
      ),
    ).resolves.toBe(false);
  });

  it("refuses acting on a user outside the actor's scopes", async () => {
    await expect(
      mayManageUserRole(
        scopeAdmin,
        { id: "target", role: Role.SCOPE_USER },
        Role.SCOPE_USER,
        shareNoScopes,
      ),
    ).resolves.toBe(false);
  });

  it("refuses a scope admin rerolling themselves", async () => {
    await expect(
      mayManageUserRole(
        scopeAdmin,
        { id: "actor", role: Role.SCOPE_ADMIN },
        Role.SCOPE_USER,
        shareScopes,
      ),
    ).resolves.toBe(false);
  });

  it("lets a platform admin set any role", async () => {
    await expect(
      mayManageUserRole(
        { id: "actor", role: Role.PLATFORM_ADMIN },
        { id: "target", role: Role.SCOPE_ADMIN },
        Role.PLATFORM_ADMIN,
        shareNoScopes,
      ),
    ).resolves.toBe(true);
  });
});
