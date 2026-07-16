import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { listWishImportReview } from "@/services/raster";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "viewer",
  );
  if ("error" in context) return context.error;

  return NextResponse.json(await listWishImportReview(context.inputSet.id));
}
