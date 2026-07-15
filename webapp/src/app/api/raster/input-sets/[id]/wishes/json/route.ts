import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { wishJsonSchema } from "@/lib/raster/schemas";
import { replaceJsonWishes } from "@/services/raster";
import { AuditAction } from "../../../../../../../../generated/prisma/enums";
import { z } from "zod";

const wishesBodySchema = z.object({
  wishes: z.array(wishJsonSchema),
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

  const parsed = wishesBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wishes JSON" }, { status: 422 });
  }

  const result = await replaceJsonWishes(
    context.inputSet.id,
    parsed.data.wishes,
  );
  await logRasterAudit({
    action: AuditAction.RASTER_INPUT_UPLOADED,
    actorId: context.user.id,
    scope: context.inputSet.scope.code,
    entityType: "RasterInputSet",
    entityId: context.inputSet.id,
    details: {
      inputType: "wishes_json",
      count: result.count,
    },
  });
  return NextResponse.json({ count: result.count });
}
