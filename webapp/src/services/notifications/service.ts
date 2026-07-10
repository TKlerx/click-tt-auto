import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  renderNotificationTemplate,
  type NotificationTemplateAudience,
  type NotificationTemplateKind,
} from "@/lib/mail/templates/notifications";
import {
  appendNotificationReferenceHtml,
  appendNotificationReferenceText,
} from "@/services/notifications/inbound";
import { getNotificationTypeConfiguration } from "@/services/notifications/admin";
import { safeQueueTeamsMessages } from "@/services/teams/service";
import {
  NotificationEventType,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";

const NOTIFICATION_JOB_TYPE = "notification_delivery";
const notificationLogger = logger.child({ component: "notifications" });

type NotificationUser = {
  id: string;
  email: string;
  name: string;
  locale?: string | null;
  role: Role;
  status: UserStatus;
};

type QueueNotificationContext = {
  actorId: string;
  eventType: NotificationEventType;
  affectedUserId?: string;
  payload: Record<string, unknown>;
  recipients: NotificationRecipient[];
  templateKind: NotificationTemplateKind;
  user: NotificationUser;
  previousRole?: Role;
  nextRole?: Role;
  previousStatus?: UserStatus;
  nextStatus?: UserStatus;
};

type NotificationRecipient = {
  audience: NotificationTemplateAudience;
  email: string;
  name: string;
  locale?: string | null;
  userId?: string | null;
};

type NotificationJobPayload = {
  notificationId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
};

export async function safeQueueUserCreatedNotifications(input: {
  actorId: string;
  user: NotificationUser;
}) {
  try {
    await queueUserCreatedNotifications(input);
  } catch (error) {
    notificationLogger.error("notifications.queue_user_created_failed", {
      error,
      actorId: input.actorId,
      affectedUserId: input.user.id,
      eventType: NotificationEventType.USER_CREATED,
    });
  }
}

export async function safeQueueRoleChangedNotifications(input: {
  actorId: string;
  user: NotificationUser;
  previousRole: Role;
  nextRole: Role;
}) {
  try {
    await queueRoleChangedNotifications(input);
  } catch (error) {
    notificationLogger.error("notifications.queue_role_changed_failed", {
      error,
      actorId: input.actorId,
      affectedUserId: input.user.id,
      eventType: NotificationEventType.ROLE_CHANGED,
      previousRole: input.previousRole,
      nextRole: input.nextRole,
    });
  }
}

export async function safeQueueUserStatusChangedNotifications(input: {
  actorId: string;
  user: NotificationUser;
  previousStatus: UserStatus;
  nextStatus: UserStatus;
}) {
  try {
    await queueUserStatusChangedNotifications(input);
  } catch (error) {
    notificationLogger.error("notifications.queue_status_changed_failed", {
      error,
      actorId: input.actorId,
      affectedUserId: input.user.id,
      eventType: NotificationEventType.USER_STATUS_CHANGED,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
    });
  }
}

export async function queueUserCreatedNotifications(input: {
  actorId: string;
  user: NotificationUser;
}) {
  const recipients = await buildRecipients(input.actorId, input.user);
  await queueNotifications({
    actorId: input.actorId,
    eventType: NotificationEventType.USER_CREATED,
    affectedUserId: input.user.id,
    payload: {
      userId: input.user.id,
      email: input.user.email,
      role: input.user.role,
      status: input.user.status,
    },
    recipients,
    templateKind: "USER_CREATED",
    user: input.user,
  });
}

export async function queueRoleChangedNotifications(input: {
  actorId: string;
  user: NotificationUser;
  previousRole: Role;
  nextRole: Role;
}) {
  const recipients = await buildRecipients(input.actorId, input.user);
  await queueNotifications({
    actorId: input.actorId,
    eventType: NotificationEventType.ROLE_CHANGED,
    affectedUserId: input.user.id,
    payload: {
      userId: input.user.id,
      email: input.user.email,
      previousRole: input.previousRole,
      nextRole: input.nextRole,
    },
    recipients,
    templateKind: "ROLE_CHANGED",
    user: input.user,
    previousRole: input.previousRole,
    nextRole: input.nextRole,
  });
}

export async function queueUserStatusChangedNotifications(input: {
  actorId: string;
  user: NotificationUser;
  previousStatus: UserStatus;
  nextStatus: UserStatus;
}) {
  const recipients = await buildRecipients(input.actorId, input.user);
  await queueNotifications({
    actorId: input.actorId,
    eventType: NotificationEventType.USER_STATUS_CHANGED,
    affectedUserId: input.user.id,
    payload: {
      userId: input.user.id,
      email: input.user.email,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
    },
    recipients,
    templateKind: "USER_STATUS_CHANGED",
    user: input.user,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
  });
}

async function queueNotifications(input: QueueNotificationContext) {
  const config = await getNotificationTypeConfiguration(input.eventType);
  if (!config.enabled) {
    return;
  }

  if (input.recipients.length === 0) {
    return;
  }

  let createdEventId: string | null = null;
  await prisma.$transaction(async (tx) => {
    const event = await tx.notificationEvent.create({
      data: {
        eventType: input.eventType,
        actorId: input.actorId,
        affectedUserId: input.affectedUserId ?? null,
        payload: JSON.stringify(input.payload),
      },
    });
    createdEventId = event.id;

    for (const recipient of input.recipients) {
      const rendered = renderNotificationTemplate({
        audience: recipient.audience,
        kind: input.templateKind,
        locale: recipient.locale,
        userName: input.user.name,
        userEmail: input.user.email,
        role: input.user.role,
        previousRole: input.previousRole,
        nextRole: input.nextRole,
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
      });

      const notification = await tx.notification.create({
        data: {
          eventId: event.id,
          recipientEmail: recipient.email,
          recipientUserId: recipient.userId ?? null,
          locale: normalizeLocale(recipient.locale),
          subject: rendered.subject,
          bodyText: rendered.bodyText,
          bodyHtml: rendered.bodyHtml,
        },
      });

      const bodyText = appendNotificationReferenceText(
        rendered.bodyText,
        notification.id,
      );
      const bodyHtml = appendNotificationReferenceHtml(
        rendered.bodyHtml,
        notification.id,
      );

      await tx.notification.update({
        where: { id: notification.id },
        data: {
          bodyText,
          bodyHtml,
        },
      });

      const jobPayload: NotificationJobPayload = {
        notificationId: notification.id,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        subject: rendered.subject,
        bodyText,
        bodyHtml,
      };

      await tx.backgroundJob.create({
        data: {
          jobType: NOTIFICATION_JOB_TYPE,
          payload: JSON.stringify(jobPayload),
          createdByUserId: input.actorId,
        },
      });
    }
  });

  if (createdEventId) {
    await safeQueueTeamsMessages({
      actorId: input.actorId,
      eventType: input.eventType,
      eventId: createdEventId,
      payload: input.payload,
    });
  }
}

async function buildRecipients(actorId: string, user: NotificationUser) {
  const recipients: NotificationRecipient[] = [];

  const userEmail = normalizeEmail(user.email);
  if (userEmail) {
    recipients.push({
      audience: "affected_user",
      email: userEmail,
      name: user.name,
      locale: user.locale,
      userId: user.id,
    });
  }

  const adminUsers = await prisma.user.findMany({
    where: {
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    },
    orderBy: { createdAt: "asc" },
  });

  for (const admin of adminUsers) {
    if (admin.id === actorId) {
      continue;
    }

    const adminEmail = normalizeEmail(admin.email);
    if (!adminEmail) {
      continue;
    }

    recipients.push({
      audience: "platform_admin",
      email: adminEmail,
      name: admin.name,
      locale: admin.locale,
      userId: admin.id,
    });
  }

  return dedupeRecipients(recipients);
}

function dedupeRecipients(recipients: NotificationRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function normalizeLocale(locale?: string | null) {
  const value = locale?.trim().toLowerCase();
  if (!value) {
    return "en";
  }

  return value.split("-")[0] || "en";
}
