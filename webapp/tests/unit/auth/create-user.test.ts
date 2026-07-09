import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../../generated/prisma/enums";

const {
  requireApiUserWithRoles,
  getPasswordComplexityErrorMessage,
  hashPassword,
  validatePasswordComplexity,
} = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
  getPasswordComplexityErrorMessage: vi.fn(
    () => "Password must contain test requirements.",
  ),
  hashPassword: vi.fn(),
  validatePasswordComplexity: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

vi.mock("@/lib/auth", () => ({
  getPasswordComplexityErrorMessage,
  hashPassword,
  validatePasswordComplexity,
}));

import { POST } from "@/app/api/users/route";

describe("create user route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a local user with expected defaults", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    validatePasswordComplexity.mockReturnValue(true);
    hashPassword.mockResolvedValue("hashed-password");
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user_1",
      email: "reviewer@example.com",
      name: "Review Person",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      authMethod: AuthMethod.LOCAL,
      mustChangePassword: true,
    } as never);

    const response = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: "Reviewer@Example.com",
          name: "Review Person",
          role: Role.SCOPE_USER,
          temporaryPassword: "TempPass123",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(validatePasswordComplexity).toHaveBeenCalledWith("TempPass123");
    expect(hashPassword).toHaveBeenCalledWith("TempPass123");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "reviewer@example.com" },
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "reviewer@example.com",
        emailVerified: true,
        name: "Review Person",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
        authMethod: AuthMethod.LOCAL,
        mustChangePassword: true,
        themePreference: ThemePreference.LIGHT,
        accounts: {
          create: {
            providerId: "credential",
            accountId: "reviewer@example.com",
            password: "hashed-password",
          },
        },
      },
    });
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(201);
  });

  it("rejects duplicate email addresses", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    validatePasswordComplexity.mockReturnValue(true);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "existing_user",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: "existing@example.com",
          name: "Existing User",
          role: Role.SCOPE_USER,
          temporaryPassword: "TempPass123",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A user with this email already exists",
    });
  });

  it("returns explicit complexity requirements for weak temporary passwords", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin_1", role: Role.PLATFORM_ADMIN },
    });
    validatePasswordComplexity.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: "reviewer@example.com",
          name: "Review Person",
          role: Role.SCOPE_USER,
          temporaryPassword: "weak",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(getPasswordComplexityErrorMessage).toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password must contain test requirements.",
    });
  });
});
