import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUserWithRoles } = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

import { GET as getNotifications } from "@/app/api/notifications/route";
import { GET as getNotificationSettings } from "@/app/api/notifications/settings/route";
import { PATCH as patchNotificationSetting } from "@/app/api/notifications/settings/[eventType]/route";

const notificationTypeConfigurationMock = (
  prismaMock as unknown as {
    notificationTypeConfiguration: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  }
).notificationTypeConfiguration;

describe("notification admin API", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (input) => {
      if (typeof input === "function") {
        return input(prismaMock);
      }

      return input;
    });
    requireApiUserWithRoles.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists notifications with optional filters", async () => {
    prismaMock.notification.findMany.mockResolvedValue([
      {
        id: "notification-1",
        eventId: "event-1",
        recipientEmail: "user@example.com",
        locale: "en",
        subject: "Your role has changed",
        status: "SENT",
        retryCount: 0,
        providerMessageId: null,
        lastError: null,
        sentAt: new Date("2026-04-20T08:00:00Z"),
        createdAt: new Date("2026-04-20T07:55:00Z"),
        updatedAt: new Date("2026-04-20T08:00:00Z"),
        event: {
          eventType: "ROLE_CHANGED",
        },
      },
    ] as never);

    const response = await getNotifications(
      new Request(
        "http://localhost/api/notifications?eventType=ROLE_CHANGED&status=SENT",
      ),
    );

    if (!response) {
      throw new Error("Expected notifications response");
    }
    expect(response.status).toBe(200);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
      where: {
        status: "SENT",
        event: {
          eventType: "ROLE_CHANGED",
        },
      },
      include: {
        event: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });
    await expect(response.json()).resolves.toMatchObject({
      notifications: [
        {
          id: "notification-1",
          eventType: "ROLE_CHANGED",
          status: "SENT",
        },
      ],
    });
  });

  it("lists notification settings after ensuring defaults", async () => {
    notificationTypeConfigurationMock.upsert.mockResolvedValue({} as never);
    notificationTypeConfigurationMock.findMany.mockResolvedValue([
      {
        eventType: "ROLE_CHANGED",
        enabled: true,
        updatedByUserId: "admin-1",
        createdAt: new Date("2026-04-20T08:00:00Z"),
        updatedAt: new Date("2026-04-20T08:00:00Z"),
      },
      {
        eventType: "USER_CREATED",
        enabled: false,
        updatedByUserId: "admin-2",
        createdAt: new Date("2026-04-20T08:00:00Z"),
        updatedAt: new Date("2026-04-20T08:30:00Z"),
      },
      {
        eventType: "USER_STATUS_CHANGED",
        enabled: true,
        updatedByUserId: null,
        createdAt: new Date("2026-04-20T08:00:00Z"),
        updatedAt: new Date("2026-04-20T08:00:00Z"),
      },
    ] as never);

    const response = await getNotificationSettings(
      new Request("http://localhost/api/notifications/settings"),
    );

    if (!response) {
      throw new Error("Expected notification settings response");
    }
    expect(response.status).toBe(200);
    expect(notificationTypeConfigurationMock.upsert).toHaveBeenCalledTimes(3);
    await expect(response.json()).resolves.toMatchObject({
      configs: [
        { eventType: "ROLE_CHANGED", enabled: true },
        { eventType: "USER_CREATED", enabled: false },
        { eventType: "USER_STATUS_CHANGED", enabled: true },
      ],
    });
  });

  it("updates a notification setting", async () => {
    notificationTypeConfigurationMock.upsert.mockResolvedValue({
      eventType: "ROLE_CHANGED",
      enabled: false,
      updatedByUserId: "admin-1",
      createdAt: new Date("2026-04-20T08:00:00Z"),
      updatedAt: new Date("2026-04-20T09:00:00Z"),
    } as never);

    const response = await patchNotificationSetting(
      new Request("http://localhost/api/notifications/settings/ROLE_CHANGED", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ eventType: "ROLE_CHANGED" }) },
    );

    if (!response) {
      throw new Error("Expected notification patch response");
    }
    expect(response.status).toBe(200);
    expect(notificationTypeConfigurationMock.upsert).toHaveBeenCalledWith({
      where: { eventType: "ROLE_CHANGED" },
      update: {
        enabled: false,
        updatedByUserId: "admin-1",
      },
      create: {
        eventType: "ROLE_CHANGED",
        enabled: false,
        updatedByUserId: "admin-1",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      config: {
        eventType: "ROLE_CHANGED",
        enabled: false,
      },
    });
  });

  it("rejects invalid filter and payload values", async () => {
    const invalidFilterResponse = await getNotifications(
      new Request("http://localhost/api/notifications?status=NOPE"),
    );
    if (!invalidFilterResponse) {
      throw new Error("Expected invalid filter response");
    }
    expect(invalidFilterResponse.status).toBe(400);

    const invalidPayloadResponse = await patchNotificationSetting(
      new Request("http://localhost/api/notifications/settings/ROLE_CHANGED", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ enabled: "nope" }),
      }),
      { params: Promise.resolve({ eventType: "ROLE_CHANGED" }) },
    );
    if (!invalidPayloadResponse) {
      throw new Error("Expected invalid payload response");
    }
    expect(invalidPayloadResponse.status).toBe(400);
  });
});
