import { safeLogAudit } from "@/lib/audit";
import { requireApiUserWithRoles } from "@/lib/route-auth";
import { deleteTokenAsAdmin } from "@/services/api/tokens";
import { AuditAction, Role } from "../../../../../../generated/prisma/enums";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const result = await deleteTokenAsAdmin(id);
  if ("error" in result) {
    return result.error;
  }

  await safeLogAudit({
    action: AuditAction.PAT_DELETED,
    entityType: "PersonalAccessToken",
    entityId: id,
    actorId: auth.user.id,
    details: {
      adminAction: true,
    },
  });

  return new Response(null, { status: 204 });
}
