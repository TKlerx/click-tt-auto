import { NextResponse } from "next/server";
import { requireRasterSnapshot } from "@/lib/raster/route-context";
import {
  listSnapshotConflicts,
  listSnapshotPenaltyEvents,
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

  const search = new URL(request.url).searchParams;
  return NextResponse.json({
    conflicts: await listSnapshotConflicts(context.snapshot.id, {
      club: search.get("club"),
      weekday: search.get("weekday"),
      hall: search.get("hall"),
      week: search.get("week") ? Number(search.get("week")) : null,
      minExcess: search.get("minExcess")
        ? Number(search.get("minExcess"))
        : null,
    }),
    penalties: await listSnapshotPenaltyEvents(context.snapshot.id),
  });
}
