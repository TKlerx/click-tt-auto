import { requireApiUserWithRoles } from "@/lib/route-auth";
import { getTeamsDelegatedGrantStatus } from "@/services/teams/consent";
import { Role } from "../../../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const status = await getTeamsDelegatedGrantStatus(auth.user.id);
  return Response.json(status);
}
