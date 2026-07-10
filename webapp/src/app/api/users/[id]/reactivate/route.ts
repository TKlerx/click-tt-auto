import { safeLogAudit } from "@/lib/audit";
import { updateManagedUserStatus } from "@/lib/user-management";
import {
  AuditAction,
  UserStatus,
} from "../../../../../../generated/prisma/enums";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return updateManagedUserStatus(
    params,
    UserStatus.ACTIVE,
    {
      requireCurrentStatus: UserStatus.INACTIVE,
      blockedMessage: "User is not inactive",
      afterUpdate: async ({ actorId, userId, previousStatus, nextStatus }) => {
        await safeLogAudit({
          action: AuditAction.USER_STATUS_CHANGED,
          entityType: "User",
          entityId: userId,
          actorId,
          details: {
            from: previousStatus,
            to: nextStatus,
          },
        });
      },
    },
    request,
  );
}
