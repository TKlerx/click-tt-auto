import { prisma } from "@/lib/db";
import { rasterScopeWhere } from "@/lib/raster/access";
import { normalizeClubName } from "@/lib/raster/club-matching";
import type { CapacityCsvRowInput } from "@/lib/raster/schemas";
import {
  HallCapacityBasis,
  type RasterWeekday,
} from "../../../generated/prisma/enums";

type InferredHallCapacity = {
  scopeId: string;
  scope: string;
  clubId: string;
  hall: string;
  weekday: RasterWeekday;
  capacity: number;
};

type CapacitySlot = {
  clubId: string;
  hall: string;
  weekday: RasterWeekday;
  startMinutes: number | null;
  durationMinutes: number;
};

type CapacityAliasClub = { id?: string; name?: string };
type CapacityAliasTeam = {
  id?: string;
  clubId?: string;
  capacityRelevant?: boolean;
};

export type HallCapacityReviewRow = Omit<InferredHallCapacity, "scopeId"> & {
  id: string | null;
  storedCapacity: number | null;
  basis: HallCapacityBasis | null;
  status: "missing" | "insufficient" | "ok" | "higher";
};

export type HallCapacityReview = {
  inferredCount: number;
  missingCount: number;
  insufficientCount: number;
  higherCount: number;
  blockingCount: number;
  aliasCandidates: HallCapacityAliasCandidate[];
  wishClubOptions: HallCapacityWishClubOption[];
  rows: HallCapacityReviewRow[];
};

export type HallCapacityAliasCandidate = {
  capacityRelevant: boolean;
  confirmed?: boolean;
  modelClubId: string;
  modelClubName: string;
  wishClubId?: string;
  wishClubName?: string;
};

export type HallCapacityWishClubOption = {
  clubId: string;
  clubName: string;
};

export async function listHallCapacities(scopeId: string) {
  return prisma.rasterHallCapacity
    .findMany({
      where: rasterScopeWhere(scopeId),
      orderBy: [{ clubId: "asc" }, { hall: "asc" }, { weekday: "asc" }],
      include: { scope: { select: { code: true } } },
    })
    .then((rows) => rows.map((row) => ({ ...row, scope: row.scope.code })));
}

export async function searchHallCapacities(scopeId: string, q?: string | null) {
  return prisma.rasterHallCapacity
    .findMany({
      where: {
        scopeId,
        ...(q
          ? {
              OR: [{ clubId: { contains: q } }, { hall: { contains: q } }],
            }
          : {}),
      },
      orderBy: [{ clubId: "asc" }, { hall: "asc" }, { weekday: "asc" }],
      include: { scope: { select: { code: true } } },
    })
    .then((rows) => rows.map((row) => ({ ...row, scope: row.scope.code })));
}

export async function upsertHallCapacities(
  rows: Array<CapacityCsvRowInput & { scopeId: string }>,
  updatedById: string,
) {
  for (const row of rows) {
    await prisma.rasterHallCapacity.upsert({
      where: {
        scopeId_clubId_hall_weekday: {
          scopeId: row.scopeId,
          clubId: row.clubId,
          hall: row.hall,
          weekday: row.weekday,
        },
      },
      update: {
        capacity: row.capacity,
        basis: HallCapacityBasis.REVIEWED,
        updatedById,
      },
      create: {
        scopeId: row.scopeId,
        clubId: row.clubId,
        hall: row.hall,
        weekday: row.weekday,
        capacity: row.capacity,
        basis: HallCapacityBasis.REVIEWED,
        updatedById,
      },
    });
  }
  await markScopeSnapshotsStale([...new Set(rows.map((row) => row.scopeId))]);
  return { count: rows.length };
}

export async function inferHallCapacitiesFromInputSet(
  inputSetId: string,
  updatedById: string,
) {
  const inferred = await inferCapacityRows(inputSetId);
  const existing = await existingCapacityMap(inferred);

  let count = 0;
  let needsReview = 0;
  for (const row of inferred) {
    const stored = existing.get(capacityKey(row));
    if (stored) {
      if (stored.capacity < row.capacity) {
        if (stored.basis === HallCapacityBasis.INFERRED) {
          await prisma.rasterHallCapacity.update({
            where: { id: stored.id },
            data: { capacity: row.capacity, updatedById },
          });
          count += 1;
        } else {
          needsReview += 1;
        }
      }
      continue;
    }
    await prisma.rasterHallCapacity.create({
      data: {
        scopeId: row.scopeId,
        clubId: row.clubId,
        hall: row.hall,
        weekday: row.weekday,
        capacity: row.capacity,
        basis: HallCapacityBasis.INFERRED,
        updatedById,
      },
    });
    count += 1;
  }
  const pruned = await pruneStaleInferredCapacities(inferred);
  if (count > 0) {
    await markScopeSnapshotsStale([
      ...new Set(inferred.map((row) => row.scopeId)),
    ]);
  }
  return { count, needsReview, pruned };
}

export async function reviewHallCapacitiesForInputSet(
  inputSetId: string,
): Promise<HallCapacityReview> {
  const [inferred, aliasReview] = await Promise.all([
    inferCapacityRows(inputSetId),
    findCapacityAliasReview(inputSetId),
  ]);
  const existing = await existingCapacityMap(inferred);
  let missingCount = 0;
  let insufficientCount = 0;
  let higherCount = 0;
  const rows: HallCapacityReviewRow[] = [];

  for (const row of inferred) {
    const reviewRow = hallCapacityReviewRow(row);
    const stored = existing.get(capacityKey(row));
    if (!stored) {
      missingCount += 1;
      rows.push({
        ...reviewRow,
        id: null,
        storedCapacity: null,
        basis: null,
        status: "missing",
      });
    } else if (stored.capacity < row.capacity) {
      insufficientCount += 1;
      rows.push({
        ...reviewRow,
        id: stored.id,
        storedCapacity: stored.capacity,
        basis: stored.basis,
        status: "insufficient",
      });
    } else if (stored.capacity > row.capacity) {
      higherCount += 1;
      rows.push({
        ...reviewRow,
        id: stored.id,
        storedCapacity: stored.capacity,
        basis: stored.basis,
        status: "higher",
      });
    } else {
      rows.push({
        ...reviewRow,
        id: stored.id,
        storedCapacity: stored.capacity,
        basis: stored.basis,
        status: "ok",
      });
    }
  }

  return {
    inferredCount: inferred.length,
    missingCount,
    insufficientCount,
    higherCount,
    blockingCount: missingCount + insufficientCount,
    aliasCandidates: aliasReview.aliasCandidates,
    wishClubOptions: aliasReview.wishClubOptions,
    rows,
  };
}

function hallCapacityReviewRow(row: InferredHallCapacity) {
  return {
    scope: row.scope,
    clubId: row.clubId,
    hall: row.hall,
    weekday: row.weekday,
    capacity: row.capacity,
  };
}

export async function updateHallCapacity(
  id: string,
  data: { capacity: number; basis?: HallCapacityBasis; updatedById: string },
) {
  const capacity = await prisma.rasterHallCapacity.update({
    where: { id },
    data,
  });
  await markScopeSnapshotsStale([capacity.scopeId]);
  return capacity;
}

async function markScopeSnapshotsStale(scopeIds: string[]) {
  for (const scopeId of scopeIds) {
    await prisma.rasterSnapshot.updateMany({
      where: { scopeId },
      data: { stale: true },
    });
  }
}

async function inferCapacityRows(
  inputSetId: string,
): Promise<InferredHallCapacity[]> {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: {
      scopeId: true,
      scope: { select: { code: true } },
      seasonModelJson: true,
      wishes: {
        select: {
          clubId: true,
          teamLabel: true,
          hall: true,
          homeWeekday: true,
          startTime: true,
          spielwochePref: true,
        },
      },
    },
  });
  if (!inputSet) return [];
  const displayScope = inputSet.scope.code;

  const model = inputSet.seasonModelJson
    ? (JSON.parse(inputSet.seasonModelJson) as {
        teams?: Array<{
          clubId?: string;
          id?: string;
          label?: string;
          teamLabel?: string;
          hall?: string;
          homeWeekday?: string;
          startTime?: string;
          spielwochePref?: string;
          capacityRelevant?: boolean;
        }>;
      })
    : { teams: [] };
  const bySlot = new Map<string, CapacitySlot[]>();
  const seen = new Set<string>();
  const clubsWithWishes = new Set(
    inputSet.wishes.map((wish) => wish.clubId).filter(Boolean),
  );
  for (const team of model.teams ?? []) {
    if (team.clubId && clubsWithWishes.has(team.clubId)) continue;
    addCapacitySlot(bySlot, seen, team);
  }
  for (const wish of inputSet.wishes) {
    addCapacitySlot(bySlot, seen, wish);
  }

  const inferred = new Map<string, InferredHallCapacity>();
  for (const [key, slots] of bySlot) {
    const [clubId, hall, weekday] = key.split("\0") as [
      string,
      string,
      RasterWeekday,
      string,
    ];
    const rowKey = [inputSet.scopeId, clubId, hall, weekday].join("\0");
    const current = inferred.get(rowKey);
    inferred.set(rowKey, {
      scopeId: inputSet.scopeId,
      scope: displayScope,
      clubId,
      hall,
      weekday,
      capacity: Math.max(current?.capacity ?? 0, requiredCapacity(slots)),
    });
  }
  return [...inferred.values()];
}

async function findCapacityAliasReview(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: {
      seasonModelJson: true,
      wishes: { select: { clubId: true, clubName: true } },
    },
  });
  if (!inputSet?.seasonModelJson) {
    return { aliasCandidates: [], wishClubOptions: [] };
  }
  const model = JSON.parse(inputSet.seasonModelJson) as {
    clubs?: Array<{ id?: string; name?: string }>;
    groups?: Array<{ planningStatus?: string; teamIds?: string[] }>;
    teams?: CapacityAliasTeam[];
    clubAliases?: Array<{
      sourceClubId?: string;
      sourceClubName?: string;
      targetClubId?: string;
      targetClubName?: string;
    }>;
  };
  const confirmedSourceIds = new Set(
    (model.clubAliases ?? []).map((alias) => alias.sourceClubId),
  );
  const wishesByName = new Map<string, { clubId: string; clubName: string }>();
  for (const wish of inputSet.wishes) {
    if (!wish.clubName) continue;
    wishesByName.set(capacityClubNameKey(wish.clubName), {
      clubId: wish.clubId,
      clubName: wish.clubName,
    });
  }
  const wishClubOptions = [...wishesByName.values()].sort((a, b) =>
    a.clubName.localeCompare(b.clubName),
  );
  const wishClubIds = new Set(wishClubOptions.map((wish) => wish.clubId));
  const excludedTeamIds = new Set(
    (model.groups ?? [])
      .filter((group) => group.planningStatus === "exclude")
      .flatMap((group) => group.teamIds ?? []),
  );
  const capacityClubIds = new Set(
    (model.teams ?? [])
      .filter((team) => !team.id || !excludedTeamIds.has(team.id))
      .map((team) => team.clubId)
      .filter((clubId): clubId is string => Boolean(clubId)),
  );
  const capacityRelevantClubIds = new Set(
    (model.teams ?? [])
      .filter(
        (team) =>
          (!team.id || !excludedTeamIds.has(team.id)) &&
          team.capacityRelevant !== false,
      )
      .map((team) => team.clubId)
      .filter((clubId): clubId is string => Boolean(clubId)),
  );

  const candidates: HallCapacityAliasCandidate[] = [];
  const seen = new Set<string>();
  for (const alias of model.clubAliases ?? []) {
    if (!alias.sourceClubId || !alias.targetClubId) continue;
    const key = [alias.sourceClubId, alias.targetClubId].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      confirmed: true,
      capacityRelevant: capacityRelevantClubIds.has(alias.sourceClubId),
      modelClubId: alias.sourceClubId,
      modelClubName: alias.sourceClubName ?? alias.sourceClubId,
      wishClubId: alias.targetClubId,
      wishClubName: alias.targetClubName ?? alias.targetClubId,
    });
  }
  for (const club of model.clubs ?? []) {
    const candidate = capacityAliasCandidateForClub(
      club,
      confirmedSourceIds,
      wishesByName,
      wishClubOptions,
      wishClubIds,
      capacityClubIds,
      capacityRelevantClubIds,
    );
    if (!candidate) continue;
    const key = [candidate.modelClubId, candidate.wishClubId ?? ""].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  candidates.sort((a, b) => {
    if (a.confirmed !== b.confirmed) return a.confirmed ? 1 : -1;
    return (
      a.modelClubName.localeCompare(b.modelClubName) ||
      a.modelClubId.localeCompare(b.modelClubId)
    );
  });
  return { aliasCandidates: candidates, wishClubOptions };
}

function capacityAliasCandidateForClub(
  club: CapacityAliasClub,
  confirmedSourceIds: Set<string | undefined>,
  wishesByName: Map<string, HallCapacityWishClubOption>,
  wishClubOptions: HallCapacityWishClubOption[],
  wishClubIds: Set<string>,
  capacityClubIds: Set<string>,
  capacityRelevantClubIds: Set<string>,
): HallCapacityAliasCandidate | null {
  if (!club.id || !club.name || confirmedSourceIds.has(club.id)) return null;
  if (!capacityClubIds.has(club.id) || wishClubIds.has(club.id)) return null;
  const exactWish = wishesByName.get(capacityClubNameKey(club.name));
  const likelyWishes = exactWish
    ? [exactWish]
    : findLikelyWishClubs(club.name, wishClubOptions);
  const wish = likelyWishes.length === 1 ? likelyWishes[0] : null;
  if (wish?.clubId === club.id) return null;
  return {
    capacityRelevant: capacityRelevantClubIds.has(club.id),
    modelClubId: club.id,
    modelClubName: club.name,
    wishClubId: wish?.clubId,
    wishClubName: wish?.clubName,
  };
}

function capacityClubNameKey(value: string) {
  return normalizeClubName(value)
    .replace(/^sportfreunde/, "spfr")
    .replace(/\d/g, "")
    .replace(/ev$/, "");
}

function findLikelyWishClubs(
  modelClubName: string,
  wishes: HallCapacityWishClubOption[],
) {
  return wishes.filter((wish) =>
    hasDistinctiveSubset(
      capacityClubTokens(modelClubName),
      capacityClubTokens(wish.clubName),
    ),
  );
}

function capacityClubTokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/\bblau[\s-]*weiss\b/gi, "bw")
    .replace(/\brot[\s-]*weiss\b/gi, "rw")
    .replace(/\bschwarz[\s-]*weiss\b/gi, "sw")
    .replace(/\bgruen[\s-]*weiss\b/gi, "gw")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 1 && !/^\d+$/.test(token) && !clubNoiseTokens.has(token),
    );
}

function hasDistinctiveSubset(left: string[], right: string[]) {
  const shorter = left.length <= right.length ? left : right;
  const longer = new Set(left.length <= right.length ? right : left);
  return (
    shorter.some((token) => token.length >= 5) &&
    shorter.every((token) => longer.has(token))
  );
}

const clubNoiseTokens = new Set([
  "djk",
  "fc",
  "sc",
  "spfr",
  "sportfreunde",
  "ssv",
  "sv",
  "tus",
  "sus",
  "ttc",
  "ttg",
  "ttv",
  "tsv",
  "tura",
  "ev",
]);

function addCapacitySlot(
  bySlot: Map<string, CapacitySlot[]>,
  seen: Set<string>,
  row: {
    clubId?: string | null;
    id?: string | null;
    label?: string | null;
    teamLabel?: string | null;
    hall?: string | null;
    homeWeekday?: string | null;
    startTime?: string | null;
    spielwochePref?: string | null;
    capacityRelevant?: boolean | null;
  },
) {
  const weekday = normalizeWeekday(row.homeWeekday ?? undefined);
  if (!row.clubId || !weekday || row.capacityRelevant === false) return;
  const slot: CapacitySlot = {
    clubId: row.clubId,
    hall: row.hall || "1",
    weekday,
    startMinutes: parseStartMinutes(row.startTime),
    durationMinutes: matchDurationMinutes(row.teamLabel ?? row.label),
  };
  const identity = [
    row.clubId,
    row.teamLabel ?? row.label ?? row.id ?? "",
    slot.hall,
    weekday,
    row.startTime ?? "",
    row.spielwochePref ?? "",
  ].join("\0");
  if (seen.has(identity)) return;
  seen.add(identity);

  if (row.spielwochePref === "A" || row.spielwochePref === "B") {
    const key = [row.clubId, slot.hall, weekday, row.spielwochePref].join("\0");
    bySlot.set(key, [...(bySlot.get(key) ?? []), slot]);
    return;
  }

  const keyA = [row.clubId, slot.hall, weekday, "A"].join("\0");
  const keyB = [row.clubId, slot.hall, weekday, "B"].join("\0");
  const candidateA = [...(bySlot.get(keyA) ?? []), slot];
  const candidateB = [...(bySlot.get(keyB) ?? []), slot];
  const targetKey =
    requiredCapacity(candidateA) <= requiredCapacity(candidateB) ? keyA : keyB;
  bySlot.set(targetKey, [...(bySlot.get(targetKey) ?? []), slot]);
}

function requiredCapacity(slots: CapacitySlot[]) {
  const unknownTimes = slots.filter(
    (slot) => slot.startMinutes === null,
  ).length;
  const events = slots
    .filter((slot): slot is CapacitySlot & { startMinutes: number } =>
      Number.isInteger(slot.startMinutes),
    )
    .flatMap((slot) => [
      { minute: slot.startMinutes, delta: 1 },
      { minute: slot.startMinutes + slot.durationMinutes, delta: -1 },
    ])
    .sort((a, b) => a.minute - b.minute || a.delta - b.delta);

  let concurrent = 0;
  let maxConcurrent = 0;
  for (const event of events) {
    concurrent += event.delta;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
  }
  return maxConcurrent + unknownTimes;
}

function matchDurationMinutes(label: string | null | undefined) {
  return /\bjugend\b/i.test(label ?? "") ? 120 : 180;
}

function parseStartMinutes(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

async function existingCapacityMap(inferred: InferredHallCapacity[]) {
  if (!inferred.length) {
    return new Map<
      string,
      { id: string; capacity: number; basis: HallCapacityBasis }
    >();
  }
  const scopeIds = [...new Set(inferred.map((row) => row.scopeId))];
  const existing = await prisma.rasterHallCapacity.findMany({
    where: { scopeId: { in: scopeIds } },
    select: {
      id: true,
      scopeId: true,
      clubId: true,
      hall: true,
      weekday: true,
      capacity: true,
      basis: true,
    },
  });
  return new Map(existing.map((row) => [capacityKey(row), row]));
}

async function pruneStaleInferredCapacities(inferred: InferredHallCapacity[]) {
  const scopeIds = [...new Set(inferred.map((row) => row.scopeId))];
  if (!scopeIds.length) return 0;
  const currentKeys = new Set(inferred.map(capacityKey));
  const stale = await prisma.rasterHallCapacity.findMany({
    where: {
      scopeId: { in: scopeIds },
      basis: HallCapacityBasis.INFERRED,
    },
    select: {
      id: true,
      scopeId: true,
      clubId: true,
      hall: true,
      weekday: true,
    },
  });
  const staleIds = stale
    .filter((row) => !currentKeys.has(capacityKey(row)))
    .map((row) => row.id);
  if (!staleIds.length) return 0;
  await prisma.rasterHallCapacity.deleteMany({
    where: { id: { in: staleIds } },
  });
  await markScopeSnapshotsStale(scopeIds);
  return staleIds.length;
}

function capacityKey(row: {
  scopeId?: string;
  clubId: string;
  hall: string;
  weekday: RasterWeekday;
}) {
  return [row.scopeId, row.clubId, row.hall, row.weekday].join("\0");
}

function normalizeWeekday(value: string | undefined): RasterWeekday | null {
  if (!value) return null;
  const weekday = value.toUpperCase();
  if (
    weekday === "MONDAY" ||
    weekday === "TUESDAY" ||
    weekday === "WEDNESDAY" ||
    weekday === "THURSDAY" ||
    weekday === "FRIDAY" ||
    weekday === "SATURDAY" ||
    weekday === "SUNDAY"
  ) {
    return weekday;
  }
  return null;
}
