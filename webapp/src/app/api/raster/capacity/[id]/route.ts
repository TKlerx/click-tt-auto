import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { logRasterAudit } from "@/lib/raster/audit";
import { updateHallCapacity } from "@/services/raster";
import {
  AuditAction,
  HallCapacityBasis,
} from "../../../../../../generated/prisma/enums";
import { z } from "zod";

const bodySchema = z.object({
  scope: z.string().trim().min(1),
  capacity: z.coerce.number().int().min(0),
  basis: z
    .enum([
      HallCapacityBasis.REVIEWED,
      HallCapacityBasis.INFERRED,
      HallCapacityBasis.MISSING,
    ])
    .optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid capacity payload" },
      { status: 422 },
    );
  }

  const access = await assertRasterAccess(
    auth.user,
    parsed.data.scope,
    "scheduler",
  );
  if (access !== true) return access.error;

  const { id } = await params;
  const capacity = await updateHallCapacity(id, {
    capacity: parsed.data.capacity,
    basis: parsed.data.basis,
    updatedById: auth.user.id,
  });
  await logRasterAudit({
    action: AuditAction.RASTER_CAPACITY_CHANGED,
    actorId: auth.user.id,
    scope: parsed.data.scope,
    entityType: "RasterHallCapacity",
    entityId: id,
    details: {
      capacity: parsed.data.capacity,
      basis: parsed.data.basis ?? null,
    },
  });

  return NextResponse.json({
    capacity,
  });
}
