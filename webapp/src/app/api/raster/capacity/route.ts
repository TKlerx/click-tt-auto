import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { capacityCsvRowSchema } from "@/lib/raster/schemas";
import { searchHallCapacities, upsertHallCapacities } from "@/services/raster";
import { AuditAction } from "../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const search = new URL(request.url).searchParams;
  const district = search.get("district")?.trim();
  if (!district) {
    return NextResponse.json(
      { error: "district is required" },
      { status: 400 },
    );
  }

  const access = await assertRasterAccess(auth.user, district, "viewer");
  if (access !== true) return access.error;

  return NextResponse.json({
    capacities: await searchHallCapacities(district, search.get("q")),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsed = capacityCsvRowSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid capacity payload" },
      { status: 422 },
    );
  }

  const access = await assertRasterAccess(
    auth.user,
    parsed.data.district,
    "scheduler",
  );
  if (access !== true) return access.error;

  const result = await upsertHallCapacities([parsed.data], auth.user.id);
  await logRasterAudit({
    action: AuditAction.RASTER_CAPACITY_CHANGED,
    actorId: auth.user.id,
    district: parsed.data.district,
    entityType: "RasterHallCapacity",
    entityId: `${parsed.data.clubId}:${parsed.data.hall}:${parsed.data.weekday}`,
    details: {
      inputType: "manual",
      capacity: parsed.data.capacity,
    },
  });

  return NextResponse.json({ result }, { status: 201 });
}
