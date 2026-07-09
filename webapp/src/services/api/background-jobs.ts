import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { Role } from "../../../generated/prisma/enums";
import type { SessionUser } from "@/lib/auth";

export type CreateBackgroundJobBody = {
  jobType?: string;
  payload?: unknown;
};

const ALLOWED_BACKGROUND_JOB_TYPES = new Set([
  "echo",
  "noop",
  "notification_delivery",
  "inbound_mail_poll",
  "teams_message_delivery",
  "teams_intake_poll",
]);
const MAX_BACKGROUND_JOB_PAYLOAD_LENGTH = 10 * 1024;
const SENSITIVE_JOB_KEYS = new Set([
  "delegatedAccessToken",
  "accessToken",
  "refreshToken",
  "authorization",
  "token",
  "apiKey",
]);

export function safeParseJobJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sanitizeJobValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJobValue(entry));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => {
        if (SENSITIVE_JOB_KEYS.has(key)) {
          return [key, "[REDACTED]"];
        }

        return [key, sanitizeJobValue(entryValue)];
      },
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function sanitizeJobField(value: string | null) {
  return sanitizeJobValue(safeParseJobJson(value));
}

function sanitizeStoredJobJson(value: string | null) {
  const parsed = safeParseJobJson(value);
  if (parsed === null) {
    return null;
  }

  const sanitized = sanitizeJobValue(parsed);
  return JSON.stringify(sanitized ?? {});
}

export async function listBackgroundJobsForUser(user: SessionUser) {
  const jobs = await prisma.backgroundJob.findMany({
    where:
      user.role === Role.PLATFORM_ADMIN
        ? undefined
        : { createdByUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return jobs.map((job) => ({
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    payload: sanitizeJobField(job.payload),
    result: sanitizeJobField(job.result),
    error: sanitizeJobValue(job.error),
    attemptCount: job.attemptCount,
    availableAt: job.availableAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    workerId: job.workerId,
    createdByUserId: job.createdByUserId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }));
}

export async function createBackgroundJobForUser(
  userId: string,
  body: CreateBackgroundJobBody,
) {
  const jobType = body.jobType?.trim();
  if (!jobType) {
    return { error: jsonError("jobType is required", 400) };
  }

  if (!ALLOWED_BACKGROUND_JOB_TYPES.has(jobType)) {
    return { error: jsonError("Unsupported jobType", 400) };
  }

  const payloadJson = JSON.stringify(body.payload ?? {});
  if (payloadJson.length > MAX_BACKGROUND_JOB_PAYLOAD_LENGTH) {
    return { error: jsonError("payload exceeds 10KB limit", 400) };
  }

  const job = await prisma.backgroundJob.create({
    data: {
      jobType,
      payload: payloadJson,
      createdByUserId: userId,
    },
  });

  return {
    job: {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      payload: sanitizeJobField(job.payload),
      createdAt: job.createdAt,
    },
  };
}

export async function cleanupHistoricalBackgroundJobPayloads(limit = 200) {
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      OR: [
        { payload: { contains: "delegatedAccessToken" } },
        { payload: { contains: "accessToken" } },
        { payload: { contains: "refreshToken" } },
        { payload: { contains: "authorization" } },
        { payload: { contains: "apiKey" } },
      ],
    },
    select: {
      id: true,
      payload: true,
      result: true,
      error: true,
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  for (const job of jobs) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        payload: sanitizeStoredJobJson(job.payload) ?? "{}",
        result: sanitizeStoredJobJson(job.result) ?? "{}",
        error:
          typeof job.error === "string"
            ? String(sanitizeJobValue(job.error))
            : job.error,
      },
    });
    updated += 1;
  }

  return { scanned: jobs.length, updated };
}

export async function runBackgroundJobPayloadCleanupMaintenance() {
  return cleanupHistoricalBackgroundJobPayloads();
}
