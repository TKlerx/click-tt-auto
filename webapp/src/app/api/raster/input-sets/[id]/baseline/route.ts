import { NextResponse } from "next/server";
import { canUseRasterLevel } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { baselineImportSchema } from "@/lib/raster/schemas";
import {
  BaselineImportConflictError,
  BaselineImportEmptyError,
  BaselineImportError,
  BaselineValidationError,
  getManualBaseline,
  importManualBaseline,
} from "@/services/raster";
import { AuditAction } from "../../../../../../../generated/prisma/enums";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "viewer",
  );
  if ("error" in context) return context.error;
  return NextResponse.json({
    ...(await getManualBaseline(context.inputSet.id)),
    canEdit: canUseRasterLevel(context.user, "scheduler"),
  });
}

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
  const parsed = baselineImportSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid baseline import request" },
      { status: 422 },
    );
  }
  try {
    const baseline = await importManualBaseline({
      inputSetId: context.inputSet.id,
      startedById: context.user.id,
    });
    await logRasterAudit({
      action: AuditAction.RASTER_INPUT_UPLOADED,
      actorId: context.user.id,
      scope: context.inputSet.scope.code,
      entityType: "RasterManualBaseline",
      entityId: baseline.active!.id,
      details: {
        inputSetId: context.inputSet.id,
        status: baseline.active!.status,
      },
    });
    return NextResponse.json(baseline);
  } catch (error) {
    await logRasterAudit({
      action: AuditAction.RASTER_INPUT_UPLOADED,
      actorId: context.user.id,
      scope: context.inputSet.scope.code,
      entityType: "RasterManualBaseline",
      entityId: context.inputSet.id,
      details: { inputSetId: context.inputSet.id, outcome: "failed" },
    });
    if (error instanceof BaselineImportConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BaselineImportEmptyError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof BaselineValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof BaselineImportError) {
      return NextResponse.json(
        { error: error.message, step: "authenticated-live-navigation" },
        { status: 502 },
      );
    }
    throw error;
  }
}
