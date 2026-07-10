import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { prisma } from "@/lib/db";
import { refreshRasterSource } from "@/services/raster";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const source = await prisma.rasterSource.findUnique({
    where: { id: (await params).id },
    include: { scope: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const access = await assertRasterAccess(auth.user, source.scope.code, "admin");
  if (access !== true) return access.error;

  try {
    return NextResponse.json({
      source: await refreshRasterSource(source.id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Source refresh failed",
      },
      { status: 422 },
    );
  }
}
