import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { provisionSsoUser } from "@/lib/user-management";

describe("SSO user provisioning", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new pending-approval SSO user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user_1",
      email: "new.user@example.com",
      name: "New User",
      role: Role.SCOPE_USER,
      status: UserStatus.PENDING_APPROVAL,
      authMethod: AuthMethod.SSO,
      mustChangePassword: false,
      themePreference: ThemePreference.LIGHT,
    } as never);

    await provisionSsoUser({
      email: "New.User@Example.com",
      name: "New User",
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "new.user@example.com",
        name: "New User",
        role: Role.SCOPE_USER,
        status: UserStatus.PENDING_APPROVAL,
        authMethod: AuthMethod.SSO,
        mustChangePassword: false,
        themePreference: ThemePreference.LIGHT,
      },
    });
  });
});
