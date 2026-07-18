import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import {
  listMatchReviewState,
  markMatchReviewRecords,
} from "@/lib/raster/match-review";

const postSchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).min(1),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await requireRasterInputSet(request, id, "viewer");
  if ("error" in context) return context.error;

  const records = await listMatchReviewState(context.inputSet.id);
  return NextResponse.json({
    records,
    outstandingCount: records.filter(
      (record) => record.status === "outstanding",
    ).length,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await requireRasterInputSet(request, id, "scheduler");
  if ("error" in context) return context.error;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid match review", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const records = await markMatchReviewRecords(
    context.inputSet.id,
    parsed.data.recordIds,
    context.user.id,
  );
  return NextResponse.json({
    records,
    outstandingCount: records.filter(
      (record) => record.status === "outstanding",
    ).length,
  });
}
