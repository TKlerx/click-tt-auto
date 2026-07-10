import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getFilePath } from "@/lib/file-storage";
import { rasterIngest } from "@/lib/raster/pipeline";

export async function listRasterSourcesForDistrict(
  district: string,
  sourceType?: string,
) {
  const scope = await prisma.scope.findFirst({
    where: { OR: [{ code: district }, { name: district }] },
    select: {
      id: true,
      parent: {
        select: {
          id: true,
          parent: { select: { id: true } },
        },
      },
    },
  });
  if (!scope) return [];

  const scopeIds = [
    scope.id,
    scope.parent?.id,
    scope.parent?.parent?.id,
  ].filter((id): id is string => Boolean(id));

  return prisma.rasterSource.findMany({
    where: {
      scopeId: { in: scopeIds },
      ...(sourceType ? { sourceType } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
  });
}

export async function upsertRasterSource(params: {
  scopeId: string;
  sourceType: string;
  sourceRef: string;
  displayName: string;
  contentHash?: string;
  parsedJson?: string;
}) {
  return prisma.rasterSource.upsert({
    where: {
      scopeId_sourceType_sourceRef: {
        scopeId: params.scopeId,
        sourceType: params.sourceType,
        sourceRef: params.sourceRef,
      },
    },
    update: {
      displayName: params.displayName,
      contentHash: params.contentHash,
      parsedJson: params.parsedJson,
    },
    create: params,
  });
}

export async function refreshRasterSource(id: string) {
  const source = await prisma.rasterSource.findUnique({
    where: { id },
    include: { scope: true },
  });
  if (!source) return null;

  const parsed = await parseSource(source.sourceType, source.sourceRef);
  return prisma.rasterSource.update({
    where: { id },
    data: {
      contentHash: parsed.contentHash,
      parsedJson: JSON.stringify(parsed.value),
    },
    include: { scope: true },
  });
}

async function parseSource(sourceType: string, sourceRef: string) {
  const normalizedType = sourceType.trim().toUpperCase();
  if (
    normalizedType === "GROUP_ASSIGNMENT" &&
    /^clicktt:\/\//i.test(sourceRef)
  ) {
    const assignments = await rasterIngest.scrapeClickTtAssignments();
    const payload = { assignments };
    return {
      contentHash: hash(Buffer.from(JSON.stringify(payload))),
      value: payload,
    };
  }

  const file = await readSourceFile(sourceRef);
  try {
    if (normalizedType === "WISHES_PDF") {
      return {
        contentHash: file.contentHash,
        value: await rasterIngest.parseWishesPdf(file.path),
      };
    }
    if (normalizedType === "GROUP_ASSIGNMENT") {
      return {
        contentHash: file.contentHash,
        value: {
          assignments: await rasterIngest.readAssignmentTable(file.path),
        },
      };
    }
    throw new Error(`Unsupported raster source type: ${sourceType}`);
  } finally {
    if (file.cleanup) await file.cleanup();
  }
}

async function readSourceFile(sourceRef: string) {
  if (/^https?:\/\//i.test(sourceRef)) {
    const response = await fetch(sourceRef);
    if (!response.ok) {
      throw new Error(`Source download failed: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const dir = await mkdtemp(path.join(tmpdir(), "raster-source-"));
    const extension = path.extname(new URL(sourceRef).pathname) || ".bin";
    const filePath = path.join(dir, `source${extension}`);
    await writeFile(filePath, buffer);
    return {
      path: filePath,
      contentHash: hash(buffer),
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }

  const filePath = getFilePath(sourceRef);
  const buffer = await readFile(filePath);
  return {
    path: filePath,
    contentHash: hash(buffer),
  };
}

function hash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
