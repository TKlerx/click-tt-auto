import { requireApiUserWithRoles } from "@/lib/route-auth";
import { getIntegrationStatus } from "@/services/teams/admin";
import { Role } from "../../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 20);
  const type = (url.searchParams.get("type") ?? "all").toLowerCase();
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 20;

  const status = await getIntegrationStatus();
  const activity = status.recentActivity
    .filter((item) => (type === "all" ? true : item.type === type))
    .slice(0, limit);

  return Response.json({
    recentActivity: activity,
  });
}
