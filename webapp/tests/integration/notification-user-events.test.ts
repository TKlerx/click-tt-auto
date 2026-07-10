import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../generated/prisma/enums";

const {
  requireApiUserWithRoles,
  requireRouteUserWithRoles,
  hashPassword,
  validatePasswordComplexity,
  safeLogAudit,
} = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
  requireRouteUserWithRoles: vi.fn(),
  hashPassword: vi.fn(),
  validatePasswordComplexity: vi.fn(),
  safeLogAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

vi.mock("@/services/api/route-context", () => ({
  requireRouteUserWithRoles,
}));

vi.mock("@/lib/auth", () => ({
  hashPassword,
  validatePasswordComplexity,
}));

vi.mock("@/lib/audit", () => ({
  safeLogAudit,
}));

import { POST as createUserPost } from "@/app/api/users/route";
import { PATCH as deactivatePatch } from "@/app/api/users/[id]/deactivate/route";
import { PATCH as rolePatch } from "@/app/api/users/[id]/role/route";

describe("notification user event integration", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.notificationEvent.create.mockResolvedValue({
      id: "event-1",
    } as never);
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job-1" } as never);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "admin-2",
        email: "admin@example.com",
        name: "Admin Two",
        locale: "en",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
        createdAt: new Date("2026-04-19T10:00:00Z"),
      },
    ] as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("queues notifications when a local user is created", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    validatePasswordComplexity.mockReturnValue(true);
    hashPassword.mockResolvedValue("hashed-password");
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "new.user@example.com",
      name: "New User",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      authMethod: AuthMethod.LOCAL,
      mustChangePassword: true,
      themePreference: ThemePreference.LIGHT,
      locale: "en",
    } as never);
    prismaMock.notification.create
      .mockResolvedValueOnce({ id: "notification-1" } as never)
      .mockResolvedValueOnce({ id: "notification-2" } as never);

    const response = await createUserPost(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: "new.user@example.com",
          name: "New User",
          role: Role.SCOPE_USER,
          temporaryPassword: "TempPass123",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    if (!response) {
      throw new Error("Expected create-user response");
    }
    expect(response.status).toBe(201);
    expect(prismaMock.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "USER_CREATED",
        affectedUserId: "user-1",
      }),
    });
    expect(prismaMock.backgroundJob.create).toHaveBeenCalledTimes(2);
  });

  it("queues notifications when a user's role changes", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "member@example.com",
      name: "Member",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      locale: "en",
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: "user-2",
      role: Role.SCOPE_ADMIN,
    } as never);
    prismaMock.notification.create
      .mockResolvedValueOnce({ id: "notification-3" } as never)
      .mockResolvedValueOnce({ id: "notification-4" } as never);

    const response = await rolePatch(
      new Request("http://localhost/api/users/user-2/role", {
        method: "PATCH",
        body: JSON.stringify({ role: Role.SCOPE_ADMIN }),
        headers: {
          "content-type": "application/json",
        },
      }),
      { params: Promise.resolve({ id: "user-2" }) },
    );

    if (!response) {
      throw new Error("Expected role-change response");
    }
    expect(response.status).toBe(200);
    expect(prismaMock.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "ROLE_CHANGED",
        affectedUserId: "user-2",
      }),
    });
    expect(prismaMock.backgroundJob.create).toHaveBeenCalledTimes(2);
  });

  it("queues notifications when a user's status changes", async () => {
    requireRouteUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-3",
      email: "inactive@example.com",
      name: "Inactive User",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      locale: "de",
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: "user-3",
      status: UserStatus.INACTIVE,
    } as never);
    prismaMock.notification.create
      .mockResolvedValueOnce({ id: "notification-5" } as never)
      .mockResolvedValueOnce({ id: "notification-6" } as never);

    const response = await deactivatePatch(
      new Request("http://localhost/api/users/user-3/deactivate", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: "user-3" }) },
    );

    if (!response) {
      throw new Error("Expected deactivate response");
    }
    expect(response.status).toBe(200);
    expect(prismaMock.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "USER_STATUS_CHANGED",
        affectedUserId: "user-3",
      }),
    });
    expect(prismaMock.backgroundJob.create).toHaveBeenCalledTimes(2);
  });
});
