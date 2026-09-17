import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { baselineRowDecisionSchema } from "@/lib/raster/schemas";
import {
  BaselineValidationError,
  reviewManualBaselineRow,
} from "@/services/raster";
import { AuditAction } from "../../../../../../../../../generated/prisma/enums";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  const routeParams = await params;
  const context = await requireRasterInputSet(
    request,
    routeParams.id,
    "scheduler",
  );
  if ("error" in context) return context.error;
  const parsed = baselineRowDecisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid baseline review decision" },
      { status: 422 },
    );
  }
  try {
    const result = await reviewManualBaselineRow({
      inputSetId: context.inputSet.id,
      rowId: routeParams.rowId,
      reviewedById: context.user.id,
      decision: parsed.data,
    });
    await logRasterAudit({
      action: AuditAction.RASTER_REVIEW_DECISION_CHANGED,
      actorId: context.user.id,
      scope: context.inputSet.scope.code,
      entityType: "RasterManualBaselineRow",
      entityId: routeParams.rowId,
      details: {
        inputSetId: context.inputSet.id,
        decision: parsed.data.decision,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BaselineValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
