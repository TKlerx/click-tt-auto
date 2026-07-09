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

describe("auth account linking", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing local account for first SSO login", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "reviewer@example.com",
      name: "Existing Reviewer",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      authMethod: AuthMethod.LOCAL,
      mustChangePassword: true,
      themePreference: ThemePreference.LIGHT,
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: "user_1",
      email: "reviewer@example.com",
      name: "Updated Name",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      authMethod: AuthMethod.BOTH,
      mustChangePassword: true,
      themePreference: ThemePreference.LIGHT,
    } as never);

    await provisionSsoUser({
      email: "Reviewer@Example.com",
      name: "Updated Name",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        name: "Updated Name",
        authMethod: AuthMethod.BOTH,
      },
    });
  });
});
