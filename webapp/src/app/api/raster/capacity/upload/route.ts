import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { rasterIngest } from "@/lib/raster/pipeline";
import { capacityCsvRowSchema } from "@/lib/raster/schemas";
import { upsertHallCapacities } from "@/services/raster";
import { AuditAction } from "../../../../../../generated/prisma/enums";

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const text = await file.text();
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  if (!headerLine) {
    return NextResponse.json({ error: "CSV is empty" }, { status: 400 });
  }

  const headers = rasterIngest
    .parseCsvLine(headerLine)
    .map((header) => (header === "district" ? "scope" : header));
  const rows = lines.map((line) => {
    const values = rasterIngest.parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
  const parsed = capacityCsvRowSchema.array().safeParse(rows);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid capacity CSV" },
      { status: 422 },
    );
  }

  const scopeCodes = [...new Set(parsed.data.map((row) => row.scope))];
  const scopes = new Map<string, string>();
  for (const scopeCode of scopeCodes) {
    const access = await assertRasterAccess(auth.user, scopeCode, "scheduler");
    if (access !== true) return access.error;
    const scope = await resolveRasterScope(scopeCode);
    if (!scope) {
      return NextResponse.json({ error: "Scope not found" }, { status: 404 });
    }
    scopes.set(scopeCode, scope.id);
  }

  const result = await upsertHallCapacities(
    parsed.data.map((row) => ({ ...row, scopeId: scopes.get(row.scope)! })),
    auth.user.id,
  );
  await Promise.all(
    scopeCodes.map((scope) =>
      logRasterAudit({
        action: AuditAction.RASTER_CAPACITY_CHANGED,
        actorId: auth.user.id,
        scope: scope,
        entityType: "RasterHallCapacity",
        entityId: "bulk",
        details: {
          inputType: "capacity_csv",
          count: parsed.data.filter((row) => row.scope === scope).length,
        },
      }),
    ),
  );

  return NextResponse.json({
    result,
  });
}
