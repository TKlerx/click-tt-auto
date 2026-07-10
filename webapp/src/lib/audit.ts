import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AuditAction } from "../../generated/prisma/enums";

const auditLogger = logger.child({ component: "audit" });

export type LogAuditInput = {
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorId: string;
  details?: unknown;
  scopeId?: string | null;
};

export async function logAudit(input: LogAuditInput) {
  return prisma.auditEntry.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId,
      scopeId: input.scopeId ?? null,
      details: JSON.stringify(input.details ?? {}),
    },
  });
}

export async function safeLogAudit(input: LogAuditInput) {
  try {
    return await logAudit(input);
  } catch (error) {
    auditLogger.error("audit.write_failed", {
      error,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      scopeId: input.scopeId ?? null,
      action: input.action,
    });
    return null;
  }
}
