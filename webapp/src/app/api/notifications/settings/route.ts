import { requireApiUserWithRoles } from "@/lib/route-auth";
import { listNotificationTypeConfigurations } from "@/services/notifications/admin";
import { Role } from "../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const configs = await listNotificationTypeConfigurations();

  return Response.json({ configs });
}
