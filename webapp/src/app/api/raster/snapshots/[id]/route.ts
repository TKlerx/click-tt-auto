import { NextResponse } from "next/server";
import { requireRasterSnapshot } from "@/lib/raster/route-context";
import {
  getSnapshotBaselineComparison,
  summarizeSnapshotConflicts,
} from "@/services/raster";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterSnapshot(
    request,
    (await params).id,
    "viewer",
  );
  if ("error" in context) return context.error;

  const [clubSummary, baselineComparison] = await Promise.all([
    summarizeSnapshotConflicts(context.snapshot.id),
    getSnapshotBaselineComparison(context.snapshot.id),
  ]);
  return NextResponse.json({
    snapshot: context.snapshot,
    topClubs: clubSummary.slice(0, 10),
    baselineComparison,
  });
}
