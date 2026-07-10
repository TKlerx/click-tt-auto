import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { fixedRasterzahlSchema } from "@/lib/raster/schemas";
import { replaceFixedRasterzahlen } from "@/services/raster";
import { AuditAction } from "../../../../../../../generated/prisma/enums";
import { z } from "zod";

const bodySchema = z.object({
  fixedRasterzahlen: z.array(fixedRasterzahlSchema),
});

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid fixed Rasterzahlen" },
      { status: 422 },
    );
  }

  const result = await replaceFixedRasterzahlen(
    context.inputSet.id,
    parsed.data.fixedRasterzahlen,
  );
  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: context.user.id,
    district: context.inputSet.district,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: {
      inputType: "fixed_rasterzahlen",
      count: result.count,
    },
  });
  return NextResponse.json({ count: result.count });
}
