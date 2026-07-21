import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import {
  inferHallCapacitiesFromInputSet,
  syncInputSetSourceCaches,
  updateClubAliasMapping,
} from "@/services/raster";
import { AuditAction } from "../../../../../../../generated/prisma/enums";

const bodySchema = z.object({
  sourceClubId: z.string().trim().min(1),
  targetClubId: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "scheduler",
  );
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid club alias", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const inputSet = await updateClubAliasMapping(
    context.inputSet.id,
    parsed.data.sourceClubId,
    parsed.data.targetClubId,
  );
  if (!inputSet) {
    return NextResponse.json({ error: "Club alias not found" }, { status: 404 });
  }
  await syncInputSetSourceCaches(context.inputSet.id);
  const capacities = await inferHallCapacitiesFromInputSet(
    context.inputSet.id,
    context.user.id,
  );

  await logRasterAudit({
    action: AuditAction.RASTER_PLANNING_CHANGED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: { type: "club-alias", ...parsed.data },
  });

  return NextResponse.json({ inputSet, capacities });
}
