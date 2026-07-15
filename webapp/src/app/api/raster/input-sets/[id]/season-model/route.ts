import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { seasonModelSchema } from "@/lib/raster/schemas";
import { updateSeasonModel } from "@/services/raster";
import { AuditAction } from "../../../../../../../generated/prisma/enums";

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

  const parsed = seasonModelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid season model", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const inputSet = await updateSeasonModel(context.inputSet.id, parsed.data);
  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: {
      type: "season-model",
      teams: parsed.data.teams.length,
      groups: parsed.data.groups.length,
    },
  });

  return NextResponse.json({ inputSet });
}
