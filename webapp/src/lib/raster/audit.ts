import { safeLogAudit } from "@/lib/audit";
import { AuditAction } from "../../../generated/prisma/enums";

type RasterAuditInput = {
  action: AuditAction;
  actorId: string;
  district: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
};

export async function logRasterAudit(input: RasterAuditInput) {
  await safeLogAudit({
    action: input.action,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    details: {
      district: input.district,
      ...input.details,
    },
  });
}
