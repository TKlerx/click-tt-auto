import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { updateGroupRasterMode } from "@/services/raster";
import { AuditAction } from "../../../../../../../../generated/prisma/enums";

const bodySchema = z.object({
  rasterMode: z.enum(["single", "double"]),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id, groupId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid group mode", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const inputSet = await updateGroupRasterMode(
    context.inputSet.id,
    decodeURIComponent(groupId),
    parsed.data.rasterMode,
  );
  if (!inputSet) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: context.user.id,
    district: context.inputSet.district,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: {
      type: "group-mode",
      groupId: decodeURIComponent(groupId),
      rasterMode: parsed.data.rasterMode,
    },
  });

  return NextResponse.json({ inputSet });
}
