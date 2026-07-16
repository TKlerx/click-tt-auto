import { prisma } from "@/lib/db";
import { diffWishValues, fingerprintWishValue } from "@/lib/raster/wish-diff";
import { wishIdentityKey } from "@/lib/raster/wish-identity";
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
      requestedRasterzahl: serializeRasterzahl(team.requestedRasterzahl),
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
      requestedRasterzahl: serializeRasterzahl(wish.requestedRasterzahl),
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
    const plans = params.rows.map((row) => ({
      row,
      identity: wishIdentityKey(row.clubId, row.teamLabel),
      fingerprint: fingerprintWishValue(row),
    }));

    const wishByIdentity = new Map(
      (
        await tx.rasterWish.findMany({
          where: { inputSetId: params.inputSetId },
        })
      ).map((wish) => [wishIdentityKey(wish.clubId, wish.teamLabel), wish]),
    );
    // A (wish, imported value) pair is settled whether its conflict was decided
    // or is still open, so one prefetch replaces two lookups per row.
    const settledConflicts = new Set(
      (
        await tx.rasterWishConflict.findMany({
          where: { inputSetId: params.inputSetId },
          select: {
            wishId: true,
            importedRow: { select: { valueFingerprint: true } },
          },
        })
      ).map((conflict) =>
        conflictKey(conflict.wishId, conflict.importedRow.valueFingerprint),
      ),
    );

    const newWishes = new Map<string, ImportWishRow>();
    const creatorIndex = new Map<string, number>();
    plans.forEach((plan, index) => {
      if (plan.row.unmatched) return;
      if (wishByIdentity.has(plan.identity)) return;
      if (newWishes.has(plan.identity)) return;
      newWishes.set(plan.identity, plan.row);
      creatorIndex.set(plan.identity, index);
    });
    const createdWishes = newWishes.size
      ? await tx.rasterWish.createManyAndReturn({
          data: [...newWishes.values()].map((row) => ({
            inputSetId: params.inputSetId,
            ...wishCreateData(row),
            origin: RasterWishOrigin.IMPORTED,
          })),
        })
      : [];
    for (const wish of createdWishes) {
      wishByIdentity.set(wishIdentityKey(wish.clubId, wish.teamLabel), wish);
    }

    const importedRows = plans.length
      ? await tx.rasterImportedWishRow.createManyAndReturn({
          data: plans.map((plan) => ({
            batchId: batch.id,
            inputSetId: params.inputSetId,
            sourceFile: params.sourceFile,
            matchedWishId: wishByIdentity.get(plan.identity)?.id ?? null,
            ...rowData(plan.row),
            valueFingerprint: plan.fingerprint,
          })),
        })
      : [];
    if (importedRows.length !== plans.length) {
      throw new Error("Imported wish rows were not returned in input order");
    }

    let noops = 0;
    let unmatched = 0;
    const conflictData: {
      inputSetId: string;
      wishId: string;
      importedRowId: string;
      differingFields: string;
    }[] = [];
    plans.forEach((plan, index) => {
      const wish = wishByIdentity.get(plan.identity);
      if (!wish) {
        unmatched += 1;
        return;
      }
      if (creatorIndex.get(plan.identity) === index) return;
      const differingFields = diffWishValues(wish, plan.row);
      if (!differingFields.length) {
        noops += 1;
        return;
      }
      const key = conflictKey(wish.id, plan.fingerprint);
      if (settledConflicts.has(key)) {
        noops += 1;
        return;
      }
      settledConflicts.add(key);
      conflictData.push({
        inputSetId: params.inputSetId,
        wishId: wish.id,
        importedRowId: importedRows[index].id,
        differingFields: JSON.stringify(differingFields),
      });
    });
    if (conflictData.length) {
      await tx.rasterWishConflict.createMany({ data: conflictData });
    }

    return {
      batchId: batch.id,
      count: params.rows.length,
      added: createdWishes.length,
      conflicts: conflictData.length,
      noops,
      unmatched,
    };
  });
}

export async function listWishImportReview(inputSetId: string) {
  const [batches, conflicts, allUnmatchedRows, addedWishes, decided, missingWishes] =
    await Promise.all([
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
        orderBy: { batch: { startedAt: "desc" } },
      }),
      // Added: created by an import and not yet looked at (FR-005).
      prisma.rasterWish.findMany({
        where: { inputSetId, origin: RasterWishOrigin.IMPORTED, reviewedAt: null },
        orderBy: [{ clubName: "asc" }, { teamLabel: "asc" }],
      }),
      // Accepted: a conflict the reviewer has already ruled on.
      prisma.rasterWishConflict.findMany({
        where: { inputSetId, decision: { not: null } },
        orderBy: { decidedAt: "desc" },
        take: 50,
        include: { wish: true, importedRow: true },
      }),
      listMissingWishes(inputSetId),
    ]);

  // Re-importing a still-unpaired team writes another row each time. They are
  // one item to review, not several, so keep only the most recent per team.
  const seen = new Set<string>();
  const unmatchedRows = allUnmatchedRows.filter((row) => {
    const key = wishIdentityKey(row.clubId, row.teamLabel);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // No-op: the latest import agreed with the wish we already held, so it
  // raised no conflict and needs no decision.
  const noopRows = batches.length
    ? await prisma.rasterImportedWishRow.findMany({
        where: {
          batchId: batches[0].id,
          matchedWishId: { not: null },
          conflicts: { none: {} },
        },
        take: 50,
        include: { matchedWish: true },
      })
    : [];

  const settledMatches = [
    ...decided.map((conflict) => ({
      id: conflict.id,
      kind: "accepted" as const,
      decision: conflict.decision,
      wish: conflict.wish,
      importedRow: conflict.importedRow,
    })),
    ...noopRows.flatMap((row) =>
      row.matchedWish
        ? [
            {
              id: row.id,
              kind: "noop" as const,
              decision: null,
              wish: row.matchedWish,
              importedRow: row,
            },
          ]
        : [],
    ),
  ];

  return {
    batches,
    conflicts,
    unmatchedRows,
    addedWishes,
    settledMatches,
    missingWishes,
  };
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
          ? { ...conflict.wish, ...serializeManualValue(params.manualValue) }
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
        // Captured before the update above lands, so it records the value the
        // decision replaced rather than the one it chose.
        previousValueJson: JSON.stringify(rowData(conflict.wish)),
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

    // A wish for this team can have appeared since the row was flagged
    // unmatched -- another import, or another admin matching a sibling row.
    // Pair with it rather than creating the duplicate the unique index would
    // reject anyway; avoiding silent duplicates is the point of this review.
    const wish = params.wishId
      ? await tx.rasterWish.findFirst({
          where: { id: params.wishId, inputSetId: params.inputSetId },
        })
      : ((await tx.rasterWish.findFirst({
          where: {
            inputSetId: params.inputSetId,
            clubId: importedRow.clubId,
            teamLabel: importedRow.teamLabel,
          },
        })) ??
        (await tx.rasterWish.create({
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
        })));
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
      requestedRasterzahl: serializeRasterzahl(wish.requestedRasterzahl),
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

// `requestedRasterzahl` is stored as a JSON string. Values reaching rowData are
// already serialized; only raw input crossing the API boundary needs encoding.
type WritableWish = {
  clubId: string;
  clubName: string;
  teamLabel?: string | null;
  homeWeekday: RasterWeekday;
  hall?: string | null;
  startTime?: string | null;
  spielwochePref?: string | null;
  requestedRasterzahl?: string | null;
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
    requestedRasterzahl: wish.requestedRasterzahl,
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

function serializeRasterzahl(value: unknown) {
  return value === undefined ? undefined : JSON.stringify(value);
}

function conflictKey(wishId: string, fingerprint: string) {
  return `${wishId}\0${fingerprint}`;
}

function serializeManualValue(manualValue?: Partial<WishJsonInput>) {
  if (!manualValue) return {};
  const { requestedRasterzahl, ...rest } = manualValue;
  if (!("requestedRasterzahl" in manualValue)) return rest;
  return {
    ...rest,
    requestedRasterzahl: serializeRasterzahl(requestedRasterzahl),
  };
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
      wishIdentityKey(
        rosterClubIds?.get(team.clubName) ?? team.clubId,
        team.teamLabel,
      ),
    ),
  );
  return activeWishes.filter(
    (wish) => !produced.has(wishIdentityKey(wish.clubId, wish.teamLabel)),
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
