import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import {
  inferHallCapacitiesFromInputSet,
  syncInputSetSourceCaches,
  updateClubAliasMapping,
} from "@/services/raster";
import { AuditAction } from "../../../../../../../generated/prisma/enums";
import { reviewSourceIdentityAlias } from "@/services/raster/sourceIdentityAliases";

const bodySchema = z.object({
  sourceClubId: z.string().trim().min(1),
  targetClubId: z.string().trim().min(1).optional(),
  kind: z.enum(["CLUB", "TEAM"]).default("CLUB"),
  createNewIdentity: z.boolean().default(false),
  canonicalName: z.string().trim().min(1).optional(),
});

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid club alias", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  if (!parsed.data.targetClubId && !parsed.data.createNewIdentity) {
    return NextResponse.json(
      { error: "Choose a target or create a new identity" },
      { status: 422 },
    );
  }
  const model = JSON.parse(context.inputSet.seasonModelJson ?? "{}") as {
    clubs?: Array<{ id: string }>;
    clubAliases?: Array<{ sourceClubId: string }>;
  };
  const isLegacyClub =
    parsed.data.kind === "CLUB" &&
    !parsed.data.createNewIdentity &&
    [
      ...(model.clubs ?? []).map((club) => club.id),
      ...(model.clubAliases ?? []).map((alias) => alias.sourceClubId),
    ].includes(parsed.data.sourceClubId);
  const inputSet = isLegacyClub
    ? await updateClubAliasMapping(
        context.inputSet.id,
        parsed.data.sourceClubId,
        parsed.data.targetClubId!,
      )
    : await reviewSourceIdentityAlias({
        inputSetId: context.inputSet.id,
        kind: parsed.data.kind,
        rawIdentity: parsed.data.sourceClubId,
        targetIdentity: parsed.data.targetClubId,
        createNewIdentity: parsed.data.createNewIdentity,
      });
  if (!inputSet) {
    return NextResponse.json(
      { error: "Source or target identity not found in this workspace" },
      { status: 404 },
    );
  }
  await syncInputSetSourceCaches(context.inputSet.id);
  const capacities = await inferHallCapacitiesFromInputSet(
    context.inputSet.id,
    context.user.id,
  );

  await logRasterAudit({
    action: AuditAction.RASTER_PLANNING_CHANGED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: { type: "club-alias", ...parsed.data },
  });

  return NextResponse.json({ inputSet, capacities });
}
