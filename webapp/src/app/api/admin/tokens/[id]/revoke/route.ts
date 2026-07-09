import { safeLogAudit } from "@/lib/audit";
import { requireApiUserWithRoles } from "@/lib/route-auth";
import { revokeTokenAsAdmin } from "@/services/api/tokens";
import { AuditAction, Role } from "../../../../../../../generated/prisma/enums";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const result = await revokeTokenAsAdmin(id);
  if ("error" in result) {
    return result.error;
  }

  await safeLogAudit({
    action: AuditAction.PAT_REVOKED,
    entityType: "PersonalAccessToken",
    entityId: id,
    actorId: auth.user.id,
    details: {
      adminAction: true,
    },
  });

  return Response.json({ token: result.token });
}
