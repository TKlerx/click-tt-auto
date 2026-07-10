import { NextResponse } from "next/server";
import { requireRasterSnapshot } from "@/lib/raster/route-context";
import { listSnapshotAssignments } from "@/services/raster";

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
    assignments: await listSnapshotAssignments(context.snapshot.id, {
      club: search.get("club"),
      league: search.get("league"),
      group: search.get("group"),
      team: search.get("team"),
      status: search.get("status"),
    }),
  });
}
