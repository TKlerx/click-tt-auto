import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import {
  updateGroupPlanningStatus,
  updateGroupRasterMode,
} from "@/services/raster";
import { AuditAction } from "../../../../../../../../generated/prisma/enums";

const bodySchema = z.object({
  rasterMode: z.enum(["single", "double"]).optional(),
  planningStatus: z.enum(["include", "exclude"]).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id, groupId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (
    !parsed.success ||
    (!parsed.data.rasterMode && !parsed.data.planningStatus)
  ) {
    return NextResponse.json(
      {
        error: "Invalid group review",
        issues: parsed.success ? [] : parsed.error.issues,
      },
      { status: 422 },
    );
  }

  const decodedGroupId = decodeURIComponent(groupId);
  let inputSet:
    | Awaited<ReturnType<typeof updateGroupRasterMode>>
    | Awaited<ReturnType<typeof updateGroupPlanningStatus>>
    | null = null;
  if (parsed.data.rasterMode) {
    inputSet = await updateGroupRasterMode(
      context.inputSet.id,
      decodedGroupId,
      parsed.data.rasterMode,
    );
  }
  if (parsed.data.planningStatus) {
    inputSet = await updateGroupPlanningStatus(
      context.inputSet.id,
      decodedGroupId,
      parsed.data.planningStatus,
    );
  }
  if (!inputSet) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  await logRasterAudit({
    action: AuditAction.RASTER_PLANNING_CHANGED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: {
      type: "group-mode",
      groupId: decodedGroupId,
      rasterMode: parsed.data.rasterMode,
      planningStatus: parsed.data.planningStatus,
    },
  });

  return NextResponse.json({ inputSet });
}
