import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { updateTeamWishFields } from "@/services/raster";
import { AuditAction } from "../../../../../../../../generated/prisma/enums";

const bodySchema = z.object({
  spielwochePref: z.enum(["A", "B"]).nullable().optional(),
  wishId: z.string().trim().min(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const { id, teamId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid team wish fields", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const inputSet = await updateTeamWishFields(
    context.inputSet.id,
    decodeURIComponent(teamId),
    parsed.data,
  );
  if (!inputSet) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: context.user.id,
    district: context.inputSet.district,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: {
      type: "team-wish-fields",
      teamId: decodeURIComponent(teamId),
      spielwochePref: parsed.data.spielwochePref,
    },
  });

  return NextResponse.json({ inputSet });
}
