import { NextResponse } from "next/server";
import { startRasterRunResponse } from "@/app/api/raster/_lib/start-run-response";
import { requireApiUser } from "@/lib/route-auth";
import { canUseRasterLevel } from "@/lib/raster/access";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  if (!canUseRasterLevel(auth.user, "admin")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: (await params).id },
    select: { id: true, spannedScopes: { select: { scopeId: true } } },
  });
  if (!inputSet || inputSet.spannedScopes.length < 2) {
    return NextResponse.json(
      { error: "Combined input set not found" },
      { status: 404 },
    );
  }

  return startRasterRunResponse(request, {
    inputSetId: inputSet.id,
    startedById: auth.user.id,
  });
}
