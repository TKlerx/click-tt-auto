import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { capacityCsvRowSchema } from "@/lib/raster/schemas";
import { searchHallCapacities, upsertHallCapacities } from "@/services/raster";
import { AuditAction } from "../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const search = new URL(request.url).searchParams;
  const scopeCode = search.get("scope")?.trim();
  if (!scopeCode) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  return NextResponse.json({
    capacities: await searchHallCapacities(scope.id, search.get("q")),
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
    parsed.data.scope,
    "scheduler",
  );
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(parsed.data.scope);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const result = await upsertHallCapacities(
    [{ ...parsed.data, scopeId: scope.id }],
    auth.user.id,
  );
  await logRasterAudit({
    action: AuditAction.RASTER_CAPACITY_CHANGED,
    actorId: auth.user.id,
    scope: parsed.data.scope,
    entityType: "RasterHallCapacity",
    entityId: `${parsed.data.clubId}:${parsed.data.hall}:${parsed.data.weekday}`,
    details: {
      inputType: "manual",
      capacity: parsed.data.capacity,
    },
  });

  return NextResponse.json({ result }, { status: 201 });
}
