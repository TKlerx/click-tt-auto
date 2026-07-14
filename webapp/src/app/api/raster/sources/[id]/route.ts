import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { prisma } from "@/lib/db";
import { deleteRasterSource } from "@/services/raster";
import { AuditAction } from "../../../../../../generated/prisma/enums";

export async function PATCH(
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

  const access = await assertRasterAccess(
    auth.user,
    source.scope.code,
    "admin",
  );
  if (access !== true) return access.error;

  const body = (await request.json().catch(() => ({}))) as {
    parsedJson?: unknown;
  };
  if (typeof body.parsedJson !== "string") {
    return NextResponse.json({ error: "Invalid parsed JSON" }, { status: 422 });
  }
  try {
    JSON.parse(body.parsedJson);
  } catch {
    return NextResponse.json({ error: "Invalid parsed JSON" }, { status: 422 });
  }

  const updated = await prisma.rasterSource.update({
    where: { id: source.id },
    data: { parsedJson: body.parsedJson },
  });
  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: auth.user.id,
    district: source.scope.code,
    entityType: "RasterSource",
    entityId: source.id,
    details: {
      change: "parsed_source_corrected",
      sourceType: source.sourceType,
      displayName: source.displayName,
    },
  });

  return NextResponse.json({
    source: updated,
  });
}

export async function DELETE(
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

  const access = await assertRasterAccess(
    auth.user,
    source.scope.code,
    "admin",
  );
  if (access !== true) return access.error;

  await deleteRasterSource(source.id);
  return NextResponse.json({ ok: true });
}
