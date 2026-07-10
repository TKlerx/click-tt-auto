import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { runSettingsSchema } from "@/lib/raster/schemas";
import { startOptimizationRun } from "@/services/raster";
import {
  AuditAction,
  InputSetStatus,
} from "../../../../../../../generated/prisma/enums";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "admin",
  );
  if ("error" in context) return context.error;
  if (context.inputSet.status !== InputSetStatus.READY) {
    return NextResponse.json(
      { error: "Input set is not ready" },
      { status: 409 },
    );
  }

  const parsed = runSettingsSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid run settings", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const run = await startOptimizationRun({
    inputSetId: context.inputSet.id,
    startedById: context.user.id,
    settings: parsed.data,
  });
  await logRasterAudit({
    action: AuditAction.RASTER_RUN_STARTED,
    actorId: context.user.id,
    district: context.inputSet.district,
    entityType: "RasterOptimizationRun",
    entityId: run.id,
    details: {
      inputSetId: context.inputSet.id,
      settings: parsed.data,
    },
  });

  return NextResponse.json({ run }, { status: 202 });
}
