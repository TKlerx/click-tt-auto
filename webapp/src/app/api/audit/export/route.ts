import { jsonError } from "@/lib/http";
import { requireApiUserWithRoles } from "@/lib/route-auth";
import { exportToCSV, exportToPDF } from "@/lib/audit-export";
import { parseAuditExportRequest } from "@/services/api/audit-filters";
import { Role } from "../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const parsedRequest = parseAuditExportRequest(request);
  if ("error" in parsedRequest) {
    return parsedRequest.error;
  }

  if (parsedRequest.format === "csv") {
    const result = await exportToCSV(parsedRequest.filters);
    return new Response(result.buffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-trail.csv"',
        "X-Audit-Export-Truncated": result.truncated ? "1" : "0",
        "X-Audit-Export-Count": String(result.exportedCount),
      },
    });
  }

  if (parsedRequest.format === "pdf") {
    const result = await exportToPDF(parsedRequest.filters);
    return new Response(result.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="audit-trail.pdf"',
        "X-Audit-Export-Truncated": result.truncated ? "1" : "0",
        "X-Audit-Export-Count": String(result.exportedCount),
      },
    });
  }

  return jsonError("Unsupported export format", 400);
}
