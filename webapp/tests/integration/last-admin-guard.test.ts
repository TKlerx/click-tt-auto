import { describe, expect, it, vi } from "vitest";
import { ensureAdminUserCanChange } from "@/services/api/user-admin";
import { Role, UserStatus } from "../../generated/prisma/enums";

describe("last admin guard", () => {
  it("refuses demoting the last active platform admin", async () => {
    const denied = await ensureAdminUserCanChange(
      { role: Role.PLATFORM_ADMIN, status: UserStatus.ACTIVE },
      {
        role: Role.SCOPE_USER,
        message: "Cannot change role of the last Admin user",
      },
      vi.fn().mockResolvedValue(1),
    );

    expect(denied?.status).toBe(400);
  });

  it("refuses deactivating the last active platform admin", async () => {
    const denied = await ensureAdminUserCanChange(
      { role: Role.PLATFORM_ADMIN, status: UserStatus.ACTIVE },
      {
        status: UserStatus.INACTIVE,
        message: "Cannot deactivate the last Admin user",
      },
      vi.fn().mockResolvedValue(1),
    );

    expect(denied?.status).toBe(400);
  });
});
