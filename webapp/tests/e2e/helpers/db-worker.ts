import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  AuthMethod,
  NotificationEventType,
  NotificationStatus,
  Role,
  ThemePreference,
  UserStatus,
  type AuditAction,
} from "../../../generated/prisma/enums";

type Operation =
  | "seedLocalUser"
  | "seedSsoUser"
  | "findUserByEmail"
  | "updateUserStatus"
  | "assignUserToScope"
  | "addAuditEntryFixture"
  | "seedBackgroundJob"
  | "seedNotificationTypeConfiguration"
  | "seedNotificationFixture";

function normalizeEmail(email: string) {
  return email.toLowerCase();
}

async function readJson<T>() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return (input ? JSON.parse(input) : {}) as T;
}

async function main() {
  const operation = process.argv[2] as Operation | undefined;
  if (!operation) {
    throw new Error("Missing db worker operation");
  }

  switch (operation) {
    case "seedLocalUser": {
      const user = await readJson<{
        email: string;
        name: string;
        role: Role;
        password: string;
        mustChangePassword: boolean;
        status?: UserStatus;
      }>();
      const normalizedEmail = normalizeEmail(user.email);
      const passwordHash = await bcrypt.hash(user.password, 12);

      const record = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: user.name,
          role: user.role,
          status: user.status ?? UserStatus.ACTIVE,
          authMethod: AuthMethod.LOCAL,
          mustChangePassword: user.mustChangePassword,
          themePreference: ThemePreference.LIGHT,
          sessions: {
            deleteMany: {},
          },
        },
        create: {
          email: normalizedEmail,
          name: user.name,
          role: user.role,
          status: user.status ?? UserStatus.ACTIVE,
          authMethod: AuthMethod.LOCAL,
          mustChangePassword: user.mustChangePassword,
          themePreference: ThemePreference.LIGHT,
          locale: "en",
        },
        select: {
          id: true,
        },
      });

      await prisma.account.upsert({
        where: {
          providerId_accountId: {
            providerId: "credential",
            accountId: normalizedEmail,
          },
        },
        update: {
          userId: record.id,
          password: passwordHash,
        },
        create: {
          accountId: normalizedEmail,
          providerId: "credential",
          userId: record.id,
          password: passwordHash,
        },
      });

      process.stdout.write(JSON.stringify(record.id));
      break;
    }

    case "seedSsoUser": {
      const user = await readJson<{
        email: string;
        name: string;
        role?: Role;
        status: UserStatus;
        authMethod?: AuthMethod;
      }>();
      const normalizedEmail = normalizeEmail(user.email);
      const record = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: user.name,
          role: user.role ?? Role.SCOPE_USER,
          status: user.status,
          authMethod: user.authMethod ?? AuthMethod.SSO,
          mustChangePassword: false,
          themePreference: ThemePreference.LIGHT,
          sessions: {
            deleteMany: {},
          },
        },
        create: {
          email: normalizedEmail,
          name: user.name,
          role: user.role ?? Role.SCOPE_USER,
          status: user.status,
          authMethod: user.authMethod ?? AuthMethod.SSO,
          mustChangePassword: false,
          themePreference: ThemePreference.LIGHT,
          locale: "en",
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(record.id));
      break;
    }

    case "findUserByEmail": {
      const { email } = await readJson<{ email: string }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          authMethod: true,
        },
      });

      process.stdout.write(JSON.stringify(user ?? null));
      break;
    }

    case "updateUserStatus": {
      const { email, status } = await readJson<{
        email: string;
        status: UserStatus;
      }>();
      await prisma.user.update({
        where: { email: normalizeEmail(email) },
        data: { status },
      });

      process.stdout.write("null");
      break;
    }

    case "assignUserToScope": {
      const { email, scope } = await readJson<{
        email: string;
        scope: { code: string; name: string };
      }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true },
      });

      if (!user) {
        throw new Error(`User not found for assignment: ${email}`);
      }

      const scopeRecord = await prisma.scope.upsert({
        where: { code: scope.code },
        update: {
          name: scope.name,
        },
        create: {
          code: scope.code,
          name: scope.name,
        },
        select: {
          id: true,
        },
      });

      await prisma.userScopeAssignment.upsert({
        where: {
          userId_scopeId: {
            userId: user.id,
            scopeId: scopeRecord.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          scopeId: scopeRecord.id,
        },
      });

      process.stdout.write(JSON.stringify(scopeRecord.id));
      break;
    }

    case "addAuditEntryFixture": {
      const input = await readJson<{
        actorEmail: string;
        action: AuditAction;
        entityType: string;
        entityId: string;
        scopeId?: string | null;
        details?: unknown;
      }>();
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(input.actorEmail) },
        select: { id: true },
      });

      if (!user) {
        throw new Error(
          `User not found for audit fixture: ${input.actorEmail}`,
        );
      }

      const entry = await prisma.auditEntry.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          actorId: user.id,
          scopeId: input.scopeId ?? null,
          details: JSON.stringify(input.details ?? {}),
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(entry.id));
      break;
    }

    case "seedBackgroundJob": {
      const input = await readJson<{
        jobType: string;
        status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
        payload?: unknown;
        result?: unknown;
        error?: string | null;
        createdByEmail?: string;
        workerId?: string | null;
        attemptCount?: number;
      }>();

      const normalizedEmail = input.createdByEmail
        ? normalizeEmail(input.createdByEmail)
        : null;
      const user = normalizedEmail
        ? await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          })
        : null;

      const job = await prisma.backgroundJob.create({
        data: {
          jobType: input.jobType,
          status: input.status ?? "PENDING",
          payload: JSON.stringify(input.payload ?? {}),
          result:
            input.result === undefined ? null : JSON.stringify(input.result),
          error: input.error ?? null,
          createdByUserId: user?.id ?? null,
          workerId: input.workerId ?? null,
          attemptCount: input.attemptCount ?? 0,
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(job.id));
      break;
    }

    case "seedNotificationTypeConfiguration": {
      const input = await readJson<{
        eventType: NotificationEventType;
        enabled: boolean;
        updatedByEmail?: string;
      }>();

      const normalizedEmail = input.updatedByEmail
        ? normalizeEmail(input.updatedByEmail)
        : null;
      const user = normalizedEmail
        ? await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          })
        : null;

      const config = await (
        prisma as unknown as {
          notificationTypeConfiguration: {
            upsert(args: {
              where: { eventType: NotificationEventType };
              update: { enabled: boolean; updatedByUserId: string | null };
              create: {
                eventType: NotificationEventType;
                enabled: boolean;
                updatedByUserId: string | null;
              };
            }): Promise<{ eventType: NotificationEventType }>;
          };
        }
      ).notificationTypeConfiguration.upsert({
        where: {
          eventType: input.eventType,
        },
        update: {
          enabled: input.enabled,
          updatedByUserId: user?.id ?? null,
        },
        create: {
          eventType: input.eventType,
          enabled: input.enabled,
          updatedByUserId: user?.id ?? null,
        },
      });

      process.stdout.write(JSON.stringify(config.eventType));
      break;
    }

    case "seedNotificationFixture": {
      const input = await readJson<{
        eventType: NotificationEventType;
        actorEmail?: string;
        affectedUserEmail?: string;
        recipientEmail: string;
        recipientUserEmail?: string;
        locale?: string;
        subject: string;
        bodyText?: string;
        bodyHtml?: string | null;
        status?: NotificationStatus;
        retryCount?: number;
        providerMessageId?: string | null;
        lastError?: string | null;
        sentAt?: string | null;
        payload?: unknown;
      }>();

      const [actor, affectedUser, recipientUser] = await Promise.all([
        input.actorEmail
          ? prisma.user.findUnique({
              where: { email: normalizeEmail(input.actorEmail) },
              select: { id: true },
            })
          : null,
        input.affectedUserEmail
          ? prisma.user.findUnique({
              where: { email: normalizeEmail(input.affectedUserEmail) },
              select: { id: true },
            })
          : null,
        input.recipientUserEmail
          ? prisma.user.findUnique({
              where: { email: normalizeEmail(input.recipientUserEmail) },
              select: { id: true },
            })
          : null,
      ]);

      const event = await prisma.notificationEvent.create({
        data: {
          eventType: input.eventType,
          actorId: actor?.id ?? null,
          affectedUserId: affectedUser?.id ?? null,
          payload: JSON.stringify(input.payload ?? {}),
        },
        select: {
          id: true,
        },
      });

      const notification = await prisma.notification.create({
        data: {
          eventId: event.id,
          recipientEmail: normalizeEmail(input.recipientEmail),
          recipientUserId: recipientUser?.id ?? null,
          locale: input.locale ?? "en",
          subject: input.subject,
          bodyText: input.bodyText ?? input.subject,
          bodyHtml: input.bodyHtml ?? null,
          status: input.status ?? NotificationStatus.QUEUED,
          retryCount: input.retryCount ?? 0,
          providerMessageId: input.providerMessageId ?? null,
          lastError: input.lastError ?? null,
          sentAt: input.sentAt ? new Date(input.sentAt) : null,
        },
        select: {
          id: true,
        },
      });

      process.stdout.write(JSON.stringify(notification.id));
      break;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
