import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { updateGroupPlanningStatuses } from "@/services/raster";
import { AuditAction } from "../../../../../../../generated/prisma/enums";

const bodySchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1),
  planningStatus: z.enum(["include", "exclude"]),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await requireRasterInputSet(request, id, "scheduler");
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid group review", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const inputSet = await updateGroupPlanningStatuses(
    context.inputSet.id,
    parsed.data.groupIds,
    parsed.data.planningStatus,
  );
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
      type: "group-planning-bulk",
      groupIds: parsed.data.groupIds,
      planningStatus: parsed.data.planningStatus,
    },
  });

  return NextResponse.json({ inputSet });
}
