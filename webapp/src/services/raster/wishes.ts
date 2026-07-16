import { prisma } from "@/lib/db";
import { diffWishValues, fingerprintWishValue } from "@/lib/raster/wish-diff";
import { findMatchingWish } from "@/lib/raster/wish-identity";
import type { WishJsonInput } from "@/lib/raster/schemas";
import {
  RasterConfidence,
  RasterConflictDecision,
  RasterWishImportKind,
  RasterWishOrigin,
  RasterWishSource,
  RasterWeekday,
} from "../../../generated/prisma/enums";
import type { WishParseResult } from "../../../../src/raster/ingest/wishes-pdf.js";
import type { Team } from "../../../../src/raster/types.js";

const weekdayMap: Record<Team["homeWeekday"], RasterWeekday> = {
  monday: RasterWeekday.MONDAY,
  tuesday: RasterWeekday.TUESDAY,
  wednesday: RasterWeekday.WEDNESDAY,
  thursday: RasterWeekday.THURSDAY,
  friday: RasterWeekday.FRIDAY,
  saturday: RasterWeekday.SATURDAY,
  sunday: RasterWeekday.SUNDAY,
};

type ImportWishRow = {
  clubId: string;
  clubName: string;
  teamLabel?: string | null;
  homeWeekday: RasterWeekday;
  hall?: string | null;
  startTime?: string | null;
  spielwochePref?: string | null;
  requestedRasterzahl?: string | null;
  notes?: string | null;
  source: RasterWishSource;
  confidence: RasterConfidence;
  unmatched: boolean;
};

export async function importParsedWishes(params: {
  inputSetId: string;
  startedById: string;
  parsed: WishParseResult;
  sourceFile?: string;
}) {
  const clubsById = new Map(params.parsed.clubs.map((club) => [club.id, club]));
  const rosterClubIds = await getRosterClubIds(params.inputSetId);
  const teams = dedupeTeams(params.parsed.teams);
  const rows = teams.map((team) => {
    const clubName = clubsById.get(team.clubId)?.name ?? team.clubId;
    const rosterClubId = rosterClubIds?.get(clubName);
    const unmatched = Boolean(rosterClubIds && !rosterClubId);
    return {
      clubId: rosterClubId ?? team.clubId,
      clubName,
      teamLabel: team.label,
      homeWeekday: weekdayMap[team.homeWeekday],
      hall: team.hall,
      startTime: team.startTime,
      spielwochePref: team.spielwochePref,
      requestedRasterzahl: stringifyOptional(team.requestedRasterzahl),
      source: RasterWishSource.PDF_PARSED,
      confidence:
        unmatched || team.confidence !== "ok"
          ? RasterConfidence.REVIEW
          : RasterConfidence.OK,
      unmatched,
    } satisfies ImportWishRow;
  });

  return importWishRows({
    inputSetId: params.inputSetId,
    startedById: params.startedById,
    sourceKind: RasterWishImportKind.PDF,
    sourceFile: params.sourceFile,
    rows,
    wishesJson: JSON.stringify({ ...params.parsed, teams }),
  });
}

export async function importJsonWishes(params: {
  inputSetId: string;
  startedById: string;
  wishes: WishJsonInput[];
  source?: RasterWishSource;
}) {
  const source = params.source ?? RasterWishSource.LLM_PASTED;
  return importWishRows({
    inputSetId: params.inputSetId,
    startedById: params.startedById,
    sourceKind: RasterWishImportKind.JSON,
    rows: params.wishes.map((wish) => ({
      clubId: wish.clubId,
      clubName: wish.clubName,
      teamLabel: wish.teamLabel,
      homeWeekday: wish.homeWeekday,
      hall: wish.hall,
      startTime: wish.startTime,
      spielwochePref: wish.spielwochePref,
      requestedRasterzahl: stringifyOptional(wish.requestedRasterzahl),
      notes: wish.notes,
      source,
      confidence: RasterConfidence.REVIEW,
      unmatched: false,
    })),
    wishesJson: JSON.stringify({ wishes: params.wishes }),
  });
}

async function importWishRows(params: {
  inputSetId: string;
  startedById: string;
  sourceKind: RasterWishImportKind;
  sourceFile?: string;
  rows: ImportWishRow[];
  wishesJson: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.rasterInputSet.update({
      where: { id: params.inputSetId },
      data: { wishesJson: params.wishesJson },
    });
    const batch = await tx.rasterWishImportBatch.create({
      data: {
        inputSetId: params.inputSetId,
        startedById: params.startedById,
        sourceKind: params.sourceKind,
      },
    });
    const activeWishes = await tx.rasterWish.findMany({
      where: { inputSetId: params.inputSetId },
    });
    let added = 0;
    let conflicts = 0;
    let noops = 0;
    let unmatched = 0;

    for (const row of params.rows) {
      const matched =
        findMatchingWish(row, activeWishes) ??
        (!row.unmatched ? null : undefined);
      let wish = matched;
      if (matched === null) {
        wish = await tx.rasterWish.create({
          data: {
            inputSetId: params.inputSetId,
            ...wishCreateData(row),
            origin: RasterWishOrigin.IMPORTED,
          },
        });
        activeWishes.push(wish);
        added += 1;
      }
      if (matched === undefined) unmatched += 1;

      const fingerprint = fingerprintWishValue(row);
      const importedRow = await tx.rasterImportedWishRow.create({
        data: {
          batchId: batch.id,
          inputSetId: params.inputSetId,
          sourceFile: params.sourceFile,
          matchedWishId: wish?.id,
          ...rowData(row),
          valueFingerprint: fingerprint,
        },
      });
      if (!wish || matched === null) continue;

      const differingFields = diffWishValues(wish, row);
      if (!differingFields.length) {
        noops += 1;
        continue;
      }
      const alreadyDecided = await tx.rasterWishConflict.findFirst({
        where: {
          wishId: wish.id,
          decision: { not: null },
          importedRow: { valueFingerprint: fingerprint },
        },
      });
      if (alreadyDecided) {
        noops += 1;
        continue;
      }
      const alreadyOpen = await tx.rasterWishConflict.findFirst({
        where: {
          importedRow: { valueFingerprint: fingerprint },
          wishId: wish.id,
          decision: null,
        },
      });
      if (alreadyOpen) {
        noops += 1;
        continue;
      }
      await tx.rasterWishConflict.create({
        data: {
          inputSetId: params.inputSetId,
          wishId: wish.id,
          importedRowId: importedRow.id,
          differingFields: JSON.stringify(differingFields),
        },
      });
      conflicts += 1;
    }
    return {
      batchId: batch.id,
      count: params.rows.length,
      added,
      conflicts,
      noops,
      unmatched,
    };
  });
}

export async function listWishImportReview(inputSetId: string) {
  const [batches, conflicts, unmatchedRows, missingWishes] = await Promise.all([
    prisma.rasterWishImportBatch.findMany({
      where: { inputSetId },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { _count: { select: { rows: true } } },
    }),
    prisma.rasterWishConflict.findMany({
      where: { inputSetId, decision: null },
      orderBy: { id: "asc" },
      include: { wish: true, importedRow: true },
    }),
    prisma.rasterImportedWishRow.findMany({
      where: { inputSetId, matchedWishId: null },
      orderBy: { id: "asc" },
    }),
    listMissingWishes(inputSetId),
  ]);
  return { batches, conflicts, unmatchedRows, missingWishes };
}

export async function resolveWishConflict(params: {
  inputSetId: string;
  conflictId: string;
  actorId: string;
  decision: RasterConflictDecision;
  manualValue?: Partial<WishJsonInput>;
}) {
  return prisma.$transaction(async (tx) => {
    const conflict = await tx.rasterWishConflict.findFirst({
      where: { id: params.conflictId, inputSetId: params.inputSetId },
      include: { wish: true, importedRow: true },
    });
    if (!conflict) return null;

    const chosen =
      params.decision === RasterConflictDecision.USE_IMPORTED
        ? conflict.importedRow
        : params.decision === RasterConflictDecision.MANUAL
          ? { ...conflict.wish, ...params.manualValue }
          : null;
    if (chosen) {
      await tx.rasterWish.update({
        where: { id: conflict.wishId },
        data: {
          ...rowData(chosen),
          origin:
            params.decision === RasterConflictDecision.MANUAL
              ? RasterWishOrigin.MANUAL
              : RasterWishOrigin.IMPORTED,
          reviewedAt: new Date(),
          reviewedById: params.actorId,
        },
      });
    }
    return tx.rasterWishConflict.update({
      where: { id: conflict.id },
      data: {
        decision: params.decision,
        decidedValueJson: chosen ? JSON.stringify(rowData(chosen)) : null,
        decidedAt: new Date(),
        decidedById: params.actorId,
      },
    });
  });
}

export async function matchImportedWishRow(params: {
  inputSetId: string;
  rowId: string;
  actorId: string;
  wishId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const importedRow = await tx.rasterImportedWishRow.findFirst({
      where: { id: params.rowId, inputSetId: params.inputSetId },
      include: { batch: true },
    });
    if (!importedRow) return null;

    const wish = params.wishId
      ? await tx.rasterWish.findFirst({
          where: { id: params.wishId, inputSetId: params.inputSetId },
        })
      : await tx.rasterWish.create({
          data: {
            inputSetId: params.inputSetId,
            ...rowData(importedRow),
            source:
              importedRow.batch.sourceKind === RasterWishImportKind.PDF
                ? RasterWishSource.PDF_PARSED
                : RasterWishSource.LLM_PASTED,
            confidence: RasterConfidence.REVIEW,
            origin: RasterWishOrigin.IMPORTED,
            reviewedAt: new Date(),
            reviewedById: params.actorId,
          },
        });
    if (!wish) return null;

    const updatedRow = await tx.rasterImportedWishRow.update({
      where: { id: importedRow.id },
      data: { matchedWishId: wish.id },
    });
    const differingFields = diffWishValues(wish, updatedRow);
    if (differingFields.length) {
      const alreadyDecided = await tx.rasterWishConflict.findFirst({
        where: {
          wishId: wish.id,
          decision: { not: null },
          importedRow: { valueFingerprint: updatedRow.valueFingerprint },
        },
      });
      const alreadyOpen = await tx.rasterWishConflict.findFirst({
        where: { importedRowId: updatedRow.id, decision: null },
      });
      if (!alreadyDecided && !alreadyOpen) {
        await tx.rasterWishConflict.create({
          data: {
            inputSetId: params.inputSetId,
            wishId: wish.id,
            importedRowId: updatedRow.id,
            differingFields: JSON.stringify(differingFields),
          },
        });
      }
    }
    return updatedRow;
  });
}

export async function confirmMissingWish(params: {
  inputSetId: string;
  wishId: string;
  actorId: string;
}) {
  return prisma.rasterWish.updateMany({
    where: { id: params.wishId, inputSetId: params.inputSetId },
    data: { reviewedAt: new Date(), reviewedById: params.actorId },
  });
}

export async function updateWish(wishId: string, wish: WishJsonInput) {
  return prisma.rasterWish.update({
    where: { id: wishId },
    data: {
      clubId: wish.clubId,
      clubName: wish.clubName,
      teamLabel: wish.teamLabel,
      homeWeekday: wish.homeWeekday,
      hall: wish.hall,
      startTime: wish.startTime,
      spielwochePref: wish.spielwochePref,
      requestedRasterzahl: stringifyOptional(wish.requestedRasterzahl),
      notes: wish.notes,
      origin: RasterWishOrigin.MANUAL,
      reviewedAt: new Date(),
    },
  });
}

async function getRosterClubIds(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: { scopeId: true, season: true },
  });
  if (!inputSet) return null;
  const roster = await prisma.rasterTeamRoster.findFirst({
    where: { scopeId: inputSet.scopeId, season: inputSet.season },
    orderBy: { importedAt: "desc" },
    select: { teams: { select: { vereinName: true, vereinNr: true } } },
  });
  if (!roster) return null;
  return new Map(roster.teams.map((team) => [team.vereinName, team.vereinNr]));
}

function dedupeTeams(parsedTeams: WishParseResult["teams"]) {
  const seen = new Set<string>();
  return parsedTeams.filter((team) => {
    const key = [
      team.clubId,
      team.label,
      team.homeWeekday,
      team.hall,
      team.startTime ?? "",
      team.spielwochePref ?? "",
      JSON.stringify(team.requestedRasterzahl ?? null),
    ].join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type WritableWish = {
  clubId: string;
  clubName: string;
  teamLabel?: string | null;
  homeWeekday: RasterWeekday;
  hall?: string | null;
  startTime?: string | null;
  spielwochePref?: string | null;
  requestedRasterzahl?: unknown;
  notes?: string | null;
  source?: RasterWishSource;
  confidence?: RasterConfidence;
};

function rowData(wish: WritableWish) {
  return {
    clubId: wish.clubId,
    clubName: wish.clubName,
    teamLabel: wish.teamLabel,
    homeWeekday: wish.homeWeekday,
    hall: wish.hall,
    startTime: wish.startTime,
    spielwochePref: wish.spielwochePref,
    requestedRasterzahl: stringifyOptional(wish.requestedRasterzahl),
    notes: wish.notes,
  };
}

function wishCreateData(wish: ImportWishRow) {
  return {
    ...rowData(wish),
    source: wish.source,
    confidence: wish.confidence,
  };
}

function stringifyOptional(value: unknown) {
  return value === undefined ? undefined : JSON.stringify(value);
}

type CurrentWishTeam = {
  clubId: string;
  clubName: string;
  teamLabel?: string | null;
};

async function listMissingWishes(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: { wishesJson: true },
  });
  const activeWishes = await prisma.rasterWish.findMany({
    where: { inputSetId },
    orderBy: [{ clubName: "asc" }, { teamLabel: "asc" }],
  });
  const parsedTeams = parseCurrentWishTeams(inputSet?.wishesJson);
  if (!parsedTeams.length) return activeWishes;

  const rosterClubIds = await getRosterClubIds(inputSetId);
  const produced = new Set(
    parsedTeams.map((team) =>
      [
        rosterClubIds?.get(team.clubName) ?? team.clubId,
        (team.teamLabel ?? "").trim().toLowerCase(),
      ].join("\0"),
    ),
  );
  return activeWishes.filter(
    (wish) =>
      !produced.has(
        [wish.clubId, (wish.teamLabel ?? "").trim().toLowerCase()].join("\0"),
      ),
  );
}

function parseCurrentWishTeams(
  wishesJson: string | null | undefined,
): CurrentWishTeam[] {
  if (!wishesJson) return [];
  try {
    const parsed = JSON.parse(wishesJson) as {
      clubs?: { id: string; name: string }[];
      teams?: { clubId: string; label?: string | null }[];
      sources?: { parsed?: WishParseResult }[];
    };
    const results: CurrentWishTeam[] =
      parsed.sources?.flatMap((source) =>
        parseCurrentWishTeams(JSON.stringify(source.parsed ?? {})),
      ) ?? [];
    if (results.length) return results;
    const clubs = new Map(
      (parsed.clubs ?? []).map((club) => [club.id, club.name]),
    );
    return (parsed.teams ?? []).map((team) => ({
      clubId: team.clubId,
      clubName: clubs.get(team.clubId) ?? team.clubId,
      teamLabel: team.label,
    }));
  } catch {
    return [];
  }
}
