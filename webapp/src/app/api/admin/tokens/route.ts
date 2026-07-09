import { requireApiUserWithRoles } from "@/lib/route-auth";
import { listAllTokens } from "@/services/api/tokens";
import { Role } from "../../../../../generated/prisma/enums";

function parseShowAll(value: string | null) {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const tokens = await listAllTokens({
    showAll: parseShowAll(url.searchParams.get("showAll")),
    userId: url.searchParams.get("userId"),
  });

  return Response.json({ tokens });
}
