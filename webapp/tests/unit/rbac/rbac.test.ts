import { describe, expect, it } from "vitest";
import { checkRole } from "@/lib/rbac";
import { Role } from "../../../generated/prisma/enums";

describe("rbac helpers", () => {
  it("allows a user with an accepted role", () => {
    expect(
      checkRole({ role: Role.PLATFORM_ADMIN }, [Role.PLATFORM_ADMIN]),
    ).toBe(true);
    expect(
      checkRole({ role: Role.SCOPE_USER }, [
        Role.SCOPE_USER,
        Role.PLATFORM_ADMIN,
      ]),
    ).toBe(true);
  });

  it("rejects a user without an accepted role", () => {
    expect(checkRole({ role: Role.SCOPE_USER }, [Role.PLATFORM_ADMIN])).toBe(
      false,
    );
  });

  it("returns false for null user", () => {
    expect(checkRole(null, [Role.PLATFORM_ADMIN])).toBe(false);
  });
});
