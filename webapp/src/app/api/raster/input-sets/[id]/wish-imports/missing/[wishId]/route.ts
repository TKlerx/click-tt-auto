import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { confirmMissingWish } from "@/services/raster";
import { AuditAction } from "../../../../../../../../../generated/prisma/enums";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; wishId: string }> },
) {
  const { id, wishId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const result = await confirmMissingWish({
    inputSetId: context.inputSet.id,
    wishId,
    actorId: context.user.id,
  });
  if (!result.count) {
    return NextResponse.json({ error: "Wish not found" }, { status: 404 });
  }

  await logRasterAudit({
    action: AuditAction.RASTER_REVIEW_DECISION_CHANGED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterWish",
    entityId: wishId,
    details: { missingConfirmed: true },
  });
  return NextResponse.json({ ok: true });
}
