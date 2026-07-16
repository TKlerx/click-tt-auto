import { NextResponse } from "next/server";
import { z } from "zod";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { matchImportedWishRow } from "@/services/raster";
import { AuditAction } from "../../../../../../../../../../generated/prisma/enums";

const bodySchema = z.object({
  wishId: z.string().trim().min(1).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  const { id, rowId } = await params;
  const context = await requireRasterInputSet(request, id, "admin");
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid row match" }, { status: 422 });
  }

  const row = await matchImportedWishRow({
    inputSetId: context.inputSet.id,
    rowId,
    actorId: context.user.id,
    wishId: parsed.data.wishId,
  });
  if (!row) {
    return NextResponse.json(
      { error: "Row or wish not found" },
      { status: 404 },
    );
  }

  await logRasterAudit({
    action: AuditAction.RASTER_REVIEW_DECISION_CHANGED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterImportedWishRow",
    entityId: rowId,
    details: { wishId: row.matchedWishId },
  });
  return NextResponse.json({ row });
}
