import { NextResponse } from "next/server";
import { startRasterRunResponse } from "@/app/api/raster/_lib/start-run-response";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
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

  return startRasterRunResponse(request, {
    inputSetId: context.inputSet.id,
    startedById: context.user.id,
    onStarted: async ({ run, settings }) => {
      await logRasterAudit({
        action: AuditAction.RASTER_RUN_STARTED,
        actorId: context.user.id,
        scope: context.inputSet.scope.code,
        entityType: "RasterOptimizationRun",
        entityId: run.id,
        details: {
          inputSetId: context.inputSet.id,
          settings,
        },
      });
    },
  });
}
