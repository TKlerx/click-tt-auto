import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
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

  const headers = rasterIngest.parseCsvLine(headerLine);
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

  const districts = [...new Set(parsed.data.map((row) => row.district))];
  for (const district of districts) {
    const access = await assertRasterAccess(auth.user, district, "scheduler");
    if (access !== true) return access.error;
  }

  const result = await upsertHallCapacities(parsed.data, auth.user.id);
  await Promise.all(
    districts.map((district) =>
      logRasterAudit({
        action: AuditAction.RASTER_CAPACITY_CHANGED,
        actorId: auth.user.id,
        district,
        entityType: "RasterHallCapacity",
        entityId: "bulk",
        details: {
          inputType: "capacity_csv",
          count: parsed.data.filter((row) => row.district === district).length,
        },
      }),
    ),
  );

  return NextResponse.json({
    result,
  });
}
