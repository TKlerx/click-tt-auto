import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { rasterIngest } from "@/lib/raster/pipeline";
import { isZip, readRasterBundle } from "@/lib/raster/bundle";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/file-storage";
import { importRasterRoster, upsertRasterSource } from "@/services/raster";

type UploadScope = { id: string; code: string; name: string };
type UploadSource = Awaited<ReturnType<typeof upsertRasterSource>>;

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
    return NextResponse.json(
      { error: "Invalid source upload" },
      { status: 422 },
    );
  }

  const isRosterSource = normalizeSourceType(sourceType) === "ROSTER_CSV";
  const isBundleSource = normalizeSourceType(sourceType) === "RASTER_BUNDLE";
  const access = await assertRasterAccess(
    auth.user,
    scopeCode,
    isRosterSource || isBundleSource ? "scheduler" : "admin",
  );
  if (access !== true) return access.error;

  const scope = await prisma.scope.findFirst({
    where: { OR: [{ code: scopeCode }, { name: scopeCode }] },
    select: { id: true, code: true, name: true },
  });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const sources = [];
  for (const file of files) {
    const result = await processUploadedFile({
      file,
      sourceType,
      displayName,
      fileCount: files.length,
      isBundleSource,
      isRosterSource,
      scope,
      season,
      userId: auth.user.id,
    });
    if (result instanceof NextResponse) return result;
    sources.push(...result);
  }

  return NextResponse.json(
    {
      source: sources[0],
      sources,
    },
    { status: 201 },
  );
}

function normalizeSourceType(sourceType: string) {
  return sourceType.trim().toUpperCase();
}

async function processUploadedFile(params: {
  file: File;
  sourceType: string;
  displayName: string;
  fileCount: number;
  isBundleSource: boolean;
  isRosterSource: boolean;
  scope: UploadScope;
  season: string;
  userId: string;
}): Promise<UploadSource[] | NextResponse> {
  const buffer = Buffer.from(await params.file.arrayBuffer());
  if (params.isBundleSource || isZip(buffer)) {
    return processBundle(buffer, params);
  }
  if (params.sourceType.toUpperCase().endsWith("_PDF") && !isPdf(buffer)) {
    return NextResponse.json(
      { error: `${params.file.name || "Uploaded file"} is not a PDF.` },
      { status: 422 },
    );
  }
  if (params.isRosterSource) {
    try {
      return [
        await importRosterSource(
          buffer,
          params.file.name || "source.csv",
          normalizeSourceType(params.sourceType),
          params.displayName,
          params.fileCount,
          params.scope,
          params.season,
          params.userId,
        ),
      ];
    } catch (error) {
      return rosterError(error);
    }
  }
  return [
    await saveRasterSource(
      buffer,
      params.file.name || "source.bin",
      params.sourceType,
      params.displayName,
      params.fileCount,
      params.scope.id,
      params.season,
    ),
  ];
}

async function processBundle(
  buffer: Buffer,
  params: {
    displayName: string;
    scope: UploadScope;
    season: string;
    userId: string;
  },
): Promise<UploadSource[] | NextResponse> {
  const bundle = await readBundleOrError(buffer);
  if (bundle instanceof NextResponse) return bundle;
  if (bundle.missing.length || bundle.unrecognized.length) {
    return NextResponse.json(
      {
        error: "Incomplete raster bundle",
        missing: bundle.missing,
        unrecognized: bundle.unrecognized,
      },
      { status: 422 },
    );
  }

  const sources: UploadSource[] = [];
  for (const entry of bundle.files) {
    if (entry.kind === "roster") {
      try {
        sources.push(
          await importRosterSource(
            entry.bytes,
            entry.name,
            "ROSTER_CSV",
            params.displayName,
            bundle.files.length,
            params.scope,
            params.season,
            params.userId,
          ),
        );
      } catch (error) {
        return rosterError(error);
      }
    } else {
      sources.push(
        await saveRasterSource(
          entry.bytes,
          entry.name,
          "WISHES_PDF",
          params.displayName,
          bundle.files.length,
          params.scope.id,
          params.season,
        ),
      );
    }
  }
  return sources;
}

async function readBundleOrError(buffer: Buffer) {
  try {
    return await readRasterBundle(buffer);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Raster bundle could not be read.",
      },
      { status: 422 },
    );
  }
}

async function importRosterSource(
  buffer: Buffer,
  fileName: string,
  sourceType: string,
  displayName: string,
  fileCount: number,
  scope: UploadScope,
  season: string,
  userId: string,
) {
  const parsed = await rasterIngest.parseRosterCsvBytes(buffer);
  const summary = await importRasterRoster({
    scopeId: scope.id,
    scopeCode: scope.code,
    scopeName: scope.name,
    season,
    importedById: userId,
    parsed,
  });
  const sourceRef = await saveFile(buffer, fileName);
  return upsertRasterSource({
    scopeId: scope.id,
    season,
    sourceType,
    sourceRef,
    displayName: sourceDisplayName(displayName, fileName, fileCount),
    parsedJson: JSON.stringify(summary),
  });
}

async function saveRasterSource(
  buffer: Buffer,
  fileName: string,
  sourceType: string,
  displayName: string,
  fileCount: number,
  scopeId: string,
  season: string,
) {
  const sourceRef = await saveFile(buffer, fileName);
  return upsertRasterSource({
    scopeId,
    season,
    sourceType,
    sourceRef,
    displayName: sourceDisplayName(displayName, fileName, fileCount),
  });
}

function rosterError(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Roster import failed.",
    },
    { status: 422 },
  );
}

function sourceDisplayName(
  displayName: string,
  file: File | string,
  fileCount: number,
) {
  const fileName = typeof file === "string" ? file : file.name;
  if (displayName && fileCount === 1) return displayName;
  if (displayName) return `${displayName} - ${fileName || "source"}`;
  return fileName || "Uploaded source";
}

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
