import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { deleteStoredFile, getFilePath } from "@/lib/file-storage";
import { rasterIngest } from "@/lib/raster/pipeline";
import { normalizeRasterSeason } from "@/lib/raster/season";

export async function listRasterSourcesForScopeCode(
  scopeCode: string,
  season = normalizeRasterSeason(undefined),
  sourceType?: string,
) {
  const scope = await prisma.scope.findFirst({
    where: { code: scopeCode },
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

  return listRasterSourcesForResolvedScope(scope, season, sourceType);
}

export async function listRasterSourcesForScope(
  scopeId: string,
  season = normalizeRasterSeason(undefined),
  sourceType?: string,
) {
  const scope = await prisma.scope.findUnique({
    where: { id: scopeId },
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

  return listRasterSourcesForResolvedScope(scope, season, sourceType);
}

function listRasterSourcesForResolvedScope(
  scope: {
    id: string;
    parent: { id: string; parent: { id: string } | null } | null;
  },
  season = normalizeRasterSeason(undefined),
  sourceType?: string,
) {
  const scopeIds = [
    scope.id,
    scope.parent?.id,
    scope.parent?.parent?.id,
  ].filter((id): id is string => Boolean(id));

  return prisma.rasterSource.findMany({
    where: {
      scopeId: { in: scopeIds },
      season: normalizeRasterSeason(season),
      ...(sourceType ? { sourceType } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
  });
}

export async function upsertRasterSource(params: {
  scopeId: string;
  season: string;
  sourceType: string;
  sourceRef: string;
  displayName: string;
  contentHash?: string;
  parsedJson?: string;
}) {
  return prisma.rasterSource.upsert({
    where: {
      scopeId_season_sourceType_sourceRef: {
        scopeId: params.scopeId,
        season: normalizeRasterSeason(params.season),
        sourceType: params.sourceType,
        sourceRef: params.sourceRef,
      },
    },
    update: {
      displayName: params.displayName,
      contentHash: params.contentHash,
      parsedJson: params.parsedJson,
    },
    create: { ...params, season: normalizeRasterSeason(params.season) },
  });
}

export async function replaceRasterSource(params: {
  scopeId: string;
  season: string;
  sourceType: string;
  sourceRef: string;
  displayName: string;
  contentHash?: string;
  parsedJson?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.rasterSource.deleteMany({
      where: {
        scopeId: params.scopeId,
        season: normalizeRasterSeason(params.season),
        sourceType: params.sourceType,
      },
    });
    return tx.rasterSource.create({
      data: { ...params, season: normalizeRasterSeason(params.season) },
    });
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

export async function deleteRasterSource(id: string) {
  const source = await prisma.rasterSource.delete({
    where: { id },
    include: { scope: true },
  });
  if (!/^https?:\/\//i.test(source.sourceRef)) {
    await deleteStoredFile(source.sourceRef);
  }
  return source;
}

async function parseSource(sourceType: string, sourceRef: string) {
  const normalizedType = sourceType.trim().toUpperCase();
  if (
    normalizedType === "GROUP_ASSIGNMENT" &&
    /^clicktt:\/\//i.test(sourceRef)
  ) {
    const assignments = await scrapeClickTtGroupAssignments(sourceRef);
    const payload = { assignments };
    return {
      contentHash: hash(Buffer.from(JSON.stringify(payload))),
      value: payload,
    };
  }
  if (normalizedType === "GROUP_ASSIGNMENT" && isClickTtLeaguePage(sourceRef)) {
    const assignments =
      await rasterIngest.scrapeClickTtPublicLeagueAssignments(sourceRef);
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
    if (normalizedType === "UPPER_LEAGUE_RASTER") {
      return {
        contentHash: file.contentHash,
        value: await rasterIngest.parseUpperLeagueRasterPdf(file.path),
      };
    }
    throw new Error(`Unsupported raster source type: ${sourceType}`);
  } finally {
    if (file.cleanup) await file.cleanup();
  }
}

async function scrapeClickTtGroupAssignments(sourceRef: string) {
  const url = new URL(sourceRef);
  const publicLeagueUrl = url.searchParams.get("publicLeagueUrl")?.trim();
  if (publicLeagueUrl) {
    return rasterIngest.scrapeClickTtPublicLeagueAssignments(publicLeagueUrl);
  }

  const groupNamePattern = url.searchParams.get("groupNamePattern")?.trim();
  return groupNamePattern
    ? rasterIngest.scrapeClickTtAssignments({ groupNamePattern })
    : rasterIngest.scrapeClickTtAssignments();
}

function isClickTtLeaguePage(sourceRef: string) {
  if (!/^https?:\/\//i.test(sourceRef)) return false;
  const url = new URL(sourceRef);
  return (
    /(?:^|\.)click-tt\.de$/i.test(url.hostname) &&
    /\/wa\/leaguePage$/i.test(url.pathname)
  );
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
