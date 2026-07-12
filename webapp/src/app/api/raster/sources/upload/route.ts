import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/file-storage";
import { upsertRasterSource } from "@/services/raster";

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const scopeCode = String(formData.get("scopeCode") ?? "").trim();
  const season = normalizeRasterSeason(String(formData.get("season") ?? ""));
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const files = formData
    .getAll("file")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (!scopeCode || !sourceType || files.length === 0) {
    return NextResponse.json({ error: "Invalid source upload" }, { status: 422 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "admin");
  if (access !== true) return access.error;

  const scope = await prisma.scope.findFirst({
    where: { OR: [{ code: scopeCode }, { name: scopeCode }] },
    select: { id: true },
  });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const sources = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const expectedPdf = sourceType.toUpperCase().endsWith("_PDF");
    if (expectedPdf && !isPdf(buffer)) {
      return NextResponse.json(
        { error: `${file.name || "Uploaded file"} is not a PDF.` },
        { status: 422 },
      );
    }
    const sourceRef = await saveFile(buffer, file.name || "source.bin");
    sources.push(
      await upsertRasterSource({
        scopeId: scope.id,
        season,
        sourceType,
        sourceRef,
        displayName: sourceDisplayName(displayName, file, files.length),
      }),
    );
  }

  return NextResponse.json(
    {
      source: sources[0],
      sources,
    },
    { status: 201 },
  );
}

function sourceDisplayName(displayName: string, file: File, fileCount: number) {
  if (displayName && fileCount === 1) return displayName;
  if (displayName) return `${displayName} - ${file.name || "source"}`;
  return file.name || "Uploaded source";
}

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
