import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { wishJsonSchema } from "@/lib/raster/schemas";
import { updateWish } from "@/services/raster";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; wishId: string }> },
) {
  const { id, wishId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const parsed = wishJsonSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wish" }, { status: 422 });
  }

  return NextResponse.json({ wish: await updateWish(wishId, parsed.data) });
}
