import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { inferHallCapacitiesFromInputSet } from "@/services/raster";

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

  return NextResponse.json({
    result: await inferHallCapacitiesFromInputSet(
      context.inputSet.id,
      context.user.id,
    ),
  });
}
