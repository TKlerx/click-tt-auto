import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterSnapshot } from "@/lib/raster/route-context";
import { createReviewDecision } from "@/services/raster";
import {
  AuditAction,
  ReviewDecisionStatus,
  ReviewTargetType,
} from "../../../../../../../generated/prisma/enums";
import { z } from "zod";

const bodySchema = z.object({
  targetType: z.enum(["CONFLICT", "CLUB_SUMMARY"]),
  targetId: z.string().trim().min(1),
  status: z.enum([
    ReviewDecisionStatus.REVIEWED,
    ReviewDecisionStatus.NEEDS_CORRECTION,
    ReviewDecisionStatus.ACCEPTED_UNAVOIDABLE,
  ]),
  note: z.string().trim().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterSnapshot(
    request,
    (await params).id,
    "scheduler",
  );
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review decision" },
      { status: 422 },
    );
  }

  const decision = await createReviewDecision({
    snapshotId: context.snapshot.id,
    targetType: ReviewTargetType[parsed.data.targetType],
    targetId: parsed.data.targetId,
    status: parsed.data.status,
    note: parsed.data.note,
    decidedById: context.user.id,
  });
  await logRasterAudit({
    action: AuditAction.RASTER_REVIEW_DECISION_CHANGED,
    actorId: context.user.id,
    district: context.snapshot.district,
    entityType: "RasterReviewDecision",
    entityId: decision.id,
    details: {
      snapshotId: context.snapshot.id,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      status: parsed.data.status,
    },
  });

  return NextResponse.json({ decision }, { status: 201 });
}
