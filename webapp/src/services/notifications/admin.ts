import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import {
  NotificationEventType,
  NotificationStatus,
} from "../../../generated/prisma/enums";

const SUPPORTED_NOTIFICATION_EVENT_TYPES = [
  NotificationEventType.USER_CREATED,
  NotificationEventType.ROLE_CHANGED,
  NotificationEventType.USER_STATUS_CHANGED,
] as const;

export type NotificationLogFilters = {
  eventType?: NotificationEventType | null;
  status?: NotificationStatus | null;
};

type NotificationTypeConfigurationRecord = {
  eventType: NotificationEventType;
  enabled: boolean;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type NotificationTypeConfigurationDelegate = {
  upsert(args: {
    where: { eventType: NotificationEventType };
    update: Partial<
      Pick<NotificationTypeConfigurationRecord, "enabled" | "updatedByUserId">
    >;
    create: {
      eventType: NotificationEventType;
      enabled: boolean;
      updatedByUserId?: string;
    };
  }): Promise<NotificationTypeConfigurationRecord>;
  findMany(args: {
    orderBy: { eventType: "asc" | "desc" };
  }): Promise<NotificationTypeConfigurationRecord[]>;
  findUnique(args: {
    where: { eventType: NotificationEventType };
  }): Promise<NotificationTypeConfigurationRecord | null>;
};

function notificationTypeConfigurations(): NotificationTypeConfigurationDelegate {
  return (
    prisma as unknown as {
      notificationTypeConfiguration: NotificationTypeConfigurationDelegate;
    }
  ).notificationTypeConfiguration;
}

export function getSupportedNotificationEventTypes() {
  return [...SUPPORTED_NOTIFICATION_EVENT_TYPES];
}

export function parseNotificationEventType(value: string | null) {
  if (!value) {
    return { eventType: null };
  }

  if (
    !Object.values(NotificationEventType).includes(
      value as NotificationEventType,
    )
  ) {
    return { error: jsonError("Invalid notification event type", 400) };
  }

  return { eventType: value as NotificationEventType };
}

export function parseNotificationStatus(value: string | null) {
  if (!value) {
    return { status: null };
  }

  if (
    !Object.values(NotificationStatus).includes(value as NotificationStatus)
  ) {
    return { error: jsonError("Invalid notification status", 400) };
  }

  return { status: value as NotificationStatus };
}

export async function ensureNotificationTypeConfigurations() {
  const delegate = notificationTypeConfigurations();
  for (const eventType of SUPPORTED_NOTIFICATION_EVENT_TYPES) {
    await delegate.upsert({
      where: { eventType },
      update: {},
      create: {
        eventType,
        enabled: true,
      },
    });
  }
}

export async function listNotificationTypeConfigurations() {
  await ensureNotificationTypeConfigurations();
  const delegate = notificationTypeConfigurations();

  const configs = await delegate.findMany({
    orderBy: {
      eventType: "asc",
    },
  });

  return configs
    .filter((config: NotificationTypeConfigurationRecord) =>
      SUPPORTED_NOTIFICATION_EVENT_TYPES.includes(
        config.eventType as (typeof SUPPORTED_NOTIFICATION_EVENT_TYPES)[number],
      ),
    )
    .map((config: NotificationTypeConfigurationRecord) => ({
      eventType: config.eventType,
      enabled: config.enabled,
      updatedByUserId: config.updatedByUserId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));
}

export async function getNotificationTypeConfiguration(
  eventType: NotificationEventType,
) {
  const config = await notificationTypeConfigurations().findUnique({
    where: { eventType },
  });

  return config ?? { eventType, enabled: true };
}

export async function updateNotificationTypeConfiguration(
  eventType: NotificationEventType,
  actorId: string,
  enabled: boolean,
) {
  if (
    !SUPPORTED_NOTIFICATION_EVENT_TYPES.includes(
      eventType as (typeof SUPPORTED_NOTIFICATION_EVENT_TYPES)[number],
    )
  ) {
    return {
      error: jsonError("Notification event type is not configurable", 400),
    };
  }

  const config = await notificationTypeConfigurations().upsert({
    where: { eventType },
    update: {
      enabled,
      updatedByUserId: actorId,
    },
    create: {
      eventType,
      enabled,
      updatedByUserId: actorId,
    },
  });

  return {
    config: {
      eventType: config.eventType,
      enabled: config.enabled,
      updatedByUserId: config.updatedByUserId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    },
  };
}

export async function listNotificationLog(
  filters: NotificationLogFilters = {},
) {
  const notifications = await prisma.notification.findMany({
    where: {
      status: filters.status ?? undefined,
      event: filters.eventType
        ? {
            eventType: filters.eventType,
          }
        : undefined,
    },
    include: {
      event: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return notifications.map((notification) => ({
    id: notification.id,
    eventId: notification.eventId,
    eventType: notification.event.eventType,
    recipientEmail: notification.recipientEmail,
    locale: notification.locale,
    subject: notification.subject,
    status: notification.status,
    retryCount: notification.retryCount,
    providerMessageId: notification.providerMessageId,
    lastError: notification.lastError,
    sentAt: notification.sentAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  }));
}
