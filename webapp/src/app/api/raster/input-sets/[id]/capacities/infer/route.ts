import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import {
  inferHallCapacitiesFromInputSet,
  syncInputSetSourceCaches,
} from "@/services/raster";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "scheduler",
  );
  if ("error" in context) return context.error;

  await syncInputSetSourceCaches(context.inputSet.id);
  return NextResponse.json({
    result: await inferHallCapacitiesFromInputSet(
      context.inputSet.id,
      context.user.id,
    ),
  });
}
