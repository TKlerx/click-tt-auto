import "dotenv/config";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import {
  AuditAction,
  AuthMethod,
  NotificationEventType,
  NotificationStatus,
  Role,
  type ThemePreference,
  UserStatus,
} from "../../../generated/prisma/enums";

type LocalUserSeed = {
  email: string;
  name: string;
  role: Role;
  password: string;
  mustChangePassword: boolean;
  status?: UserStatus;
};

function runDbWorker<TInput, TResult>(
  operation: string,
  payload: TInput,
): TResult {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://starter:starter_e2e_password@localhost:55432/business_app_starter_e2e_test";
  const output = runDbWorkerWithRetry(operation, payload, databaseUrl).trim();

  return output ? (JSON.parse(output) as TResult) : (null as TResult);
}

function runDbWorkerWithRetry<TInput>(
  operation: string,
  payload: TInput,
  databaseUrl: string,
) {
  const options = {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    encoding: "utf8",
    input: JSON.stringify(payload),
    stdio: ["pipe", "pipe", "pipe"],
  } satisfies ExecFileSyncOptions;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return execFileSync(
        process.execPath,
        ["--import", "tsx", "tests/e2e/helpers/db-worker.ts", operation],
        options,
      ) as string;
    } catch (error) {
      lastError = error;
      if (!isRetryableDatabaseWorkerError(error) || attempt === 3) {
        throw error;
      }
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        250 * attempt,
      );
    }
  }

  throw lastError;
}

function isRetryableDatabaseWorkerError(error: unknown) {
  const candidate = error as { stderr?: Buffer | string; message?: string };
  const stderr = Buffer.isBuffer(candidate.stderr)
    ? candidate.stderr.toString("utf8")
    : (candidate.stderr ?? "");
  const message = candidate.message ?? "";

  return /P1017|ConnectionClosed|Server has closed the connection/i.test(
    `${stderr}\n${message}`,
  );
}

export function seedLocalUser(user: LocalUserSeed) {
  return runDbWorker<typeof user, string>("seedLocalUser", user);
}

export function seedSsoUser(user: {
  email: string;
  name: string;
  role?: Role;
  status: UserStatus;
  authMethod?: AuthMethod;
}) {
  return runDbWorker<typeof user, string>("seedSsoUser", user);
}

export function findUserByEmail(email: string) {
  return runDbWorker<
    { email: string },
    {
      id: string;
      email: string;
      name: string;
      role: Role;
      status: UserStatus;
      authMethod: AuthMethod;
    } | null
  >("findUserByEmail", { email });
}

export function updateUserStatus(email: string, status: UserStatus) {
  return runDbWorker<{ email: string; status: UserStatus }, null>(
    "updateUserStatus",
    {
      email,
      status,
    },
  );
}

export function deactivatePlatformAdminsExcept(email: string) {
  return runDbWorker<{ email: string }, null>(
    "deactivatePlatformAdminsExcept",
    {
      email,
    },
  );
}

export function assignUserToScope(
  email: string,
  scope: { code: string; name: string },
) {
  return runDbWorker<
    { email: string; scope: { code: string; name: string } },
    string
  >("assignUserToScope", {
    email,
    scope,
  });
}

export function seedRasterScopeHierarchy() {
  return runDbWorker<
    Record<string, never>,
    { de: string; wttv: string; owl: string }
  >("seedRasterScopeHierarchy", {});
}

export function seedRasterSource(input: {
  scopeCode: string;
  sourceType: string;
  sourceRef: string;
  displayName: string;
  season?: string;
  contentHash?: string | null;
  parsedJson?: unknown;
}) {
  return runDbWorker<typeof input, string>("seedRasterSource", input);
}

export function seedRasterProjectionFixture(input: {
  email: string;
  suffix: string;
}) {
  return runDbWorker<
    typeof input,
    {
      inputSetId: string;
      teamCount: number;
      uniqueClubLabelKeys: number;
      youthStartTime?: string;
      adultWeekday?: string;
      defaultOnlyCount: number;
      relationalWishes: number;
    }
  >("seedRasterProjectionFixture", input);
}

export function addAuditEntryFixture(input: {
  actorEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  scopeId?: string | null;
  details?: unknown;
}) {
  return runDbWorker<typeof input, string>("addAuditEntryFixture", input);
}

export function seedBackgroundJob(input: {
  jobType: string;
  status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  payload?: unknown;
  result?: unknown;
  error?: string | null;
  createdByEmail?: string;
  workerId?: string | null;
  attemptCount?: number;
}) {
  return runDbWorker<typeof input, string>("seedBackgroundJob", input);
}

export function seedNotificationTypeConfiguration(input: {
  eventType: NotificationEventType;
  enabled: boolean;
  updatedByEmail?: string;
}) {
  return runDbWorker<typeof input, string>(
    "seedNotificationTypeConfiguration",
    input,
  );
}

export function seedNotificationFixture(input: {
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
}) {
  return runDbWorker<typeof input, string>("seedNotificationFixture", input);
}

export {
  AuditAction,
  AuthMethod,
  NotificationEventType,
  NotificationStatus,
  Role,
  UserStatus,
};
export type { ThemePreference };
