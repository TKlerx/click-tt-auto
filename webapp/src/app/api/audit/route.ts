import { requireApiUserWithRoles } from "@/lib/route-auth";
import { getAuditEntries } from "@/lib/audit-export";
import { parseAuditListRequest } from "@/services/api/audit-filters";
import { Role } from "../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const parsedRequest = parseAuditListRequest(request);
  if ("error" in parsedRequest) {
    return parsedRequest.error;
  }

  const result = await getAuditEntries(parsedRequest.filters);

  return Response.json({
    data: result.entries,
    total: result.total,
    page: parsedRequest.page,
    limit: parsedRequest.limit,
  });
}
