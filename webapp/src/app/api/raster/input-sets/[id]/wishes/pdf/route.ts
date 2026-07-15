import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { logRasterAudit } from "@/lib/raster/audit";
import { rasterIngest } from "@/lib/raster/pipeline";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import { replaceParsedWishes } from "@/services/raster";
import { AuditAction } from "../../../../../../../../generated/prisma/enums";

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

  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const dir = await mkdtemp(path.join(tmpdir(), "raster-wishes-"));
  const filePath = path.join(dir, file.name || "wishes.pdf");
  try {
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    const parsed = await rasterIngest.parseWishesPdf(filePath);
    if (parsed.teams.length === 0) {
      return NextResponse.json(
        {
          error: "No teams could be extracted from this PDF",
          fallback:
            "Use the wishes prompt endpoint and paste the reviewed JSON into the wishes JSON endpoint.",
          warnings: parsed.warnings,
        },
        { status: 422 },
      );
    }
    const result = await replaceParsedWishes(context.inputSet.id, parsed);
    await logRasterAudit({
      action: AuditAction.RASTER_INPUT_UPLOADED,
      actorId: context.user.id,
      scope: context.inputSet.scope.code,
      entityType: "RasterInputSet",
      entityId: context.inputSet.id,
      details: {
        inputType: "wishes_pdf",
        fileName: file.name || "wishes.pdf",
        count: result.count,
        warningCount: parsed.warnings.length,
      },
    });
    return NextResponse.json({
      count: result.count,
      warnings: parsed.warnings,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
