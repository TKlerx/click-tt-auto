import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { wishJsonSchema } from "@/lib/raster/schemas";
import { resolveWishConflict } from "@/services/raster";
import {
  AuditAction,
  RasterConflictDecision,
} from "../../../../../../../../../generated/prisma/enums";

const bodySchema = z
  .object({
    decision: z.nativeEnum(RasterConflictDecision),
    manualValue: wishJsonSchema.partial().optional(),
  })
  // Without a value, MANUAL would silently keep the existing wish and only
  // relabel its origin, which is not a decision the reviewer asked for.
  .refine(
    (body) =>
      body.decision !== RasterConflictDecision.MANUAL ||
      (body.manualValue && Object.keys(body.manualValue).length > 0),
    { message: "A manual decision requires a manual value", path: ["manualValue"] },
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; conflictId: string }> },
) {
  const { id, conflictId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid conflict decision" },
      { status: 422 },
    );
  }

  const decision = await resolveWishConflict({
    inputSetId: context.inputSet.id,
    conflictId,
    actorId: context.user.id,
    ...parsed.data,
  });
  if (!decision) {
    return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  }

  await logRasterAudit({
    action: AuditAction.RASTER_REVIEW_DECISION_CHANGED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterWishConflict",
    entityId: conflictId,
    details: { decision: parsed.data.decision },
  });
  return NextResponse.json({ conflict: decision });
}
