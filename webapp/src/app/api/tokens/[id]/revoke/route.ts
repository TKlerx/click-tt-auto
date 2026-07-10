import { safeLogAudit } from "@/lib/audit";
import { requireApiUser } from "@/lib/route-auth";
import { revokeToken } from "@/services/api/tokens";
import { AuditAction } from "../../../../../../generated/prisma/enums";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const result = await revokeToken(id, auth.user.id);
  if ("error" in result) {
    return result.error;
  }

  await safeLogAudit({
    action: AuditAction.PAT_REVOKED,
    entityType: "PersonalAccessToken",
    entityId: id,
    actorId: auth.user.id,
  });

  return Response.json({ token: result.token });
}
