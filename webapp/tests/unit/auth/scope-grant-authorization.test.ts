import { describe, expect, it } from "vitest";
import { canAssignRole, mayManageScopeAssignment } from "@/lib/rbac";
import { Role } from "../../../generated/prisma/enums";

const owl = "scope-owl";
const koeln = "scope-koeln";
const germany = "scope-de";

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
