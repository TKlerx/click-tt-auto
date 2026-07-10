import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { validateInputSet } from "@/services/raster";

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

  const result = await validateInputSet(context.inputSet.id);
  return NextResponse.json(result);
}
