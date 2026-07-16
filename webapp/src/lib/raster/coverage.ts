import { isSelectableRasterScope } from "@/lib/raster/scope-level";

type SeasonGroup = {
  id?: string;
  ref?: { league?: string; name?: string };
  planningStatus?: "include" | "exclude";
  teamIds?: string[];
};

type SeasonTeam = {
  id?: string;
  clubId?: string;
  label?: string;
  teamLabel?: string;
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
  wishMatchId?: string;
};

export type CoverageRecord = {
  complete: boolean;
  spannedScopes: string[];
  spannedAll: boolean;
  excludedGroups: string[];
  wishGaps: Array<{
    teamId: string;
    missing: Array<"wish" | "gameDay" | "gym" | "startTime">;
  }>;
  capacityGaps: Array<{
    clubId: string;
    hall: string;
    weekday: string;
    status: "missing" | "insufficient";
  }>;
  unresolvedWishConflicts?: {
    count: number;
    conflicts: Array<{ id: string; wishId: string; importedRowId: string }>;
  };
};

export function computeCoverageRecord(input: {
  seasonModelJson?: string | null;
  spannedScopeIds: string[];
  allScopeIds: string[];
  capacityReview?: {
    rows: Array<{
      clubId: string;
      hall: string;
      weekday: string;
      status: "missing" | "insufficient" | "ok" | "higher";
    }>;
  };
}): CoverageRecord {
  const model = parseSeasonModel(input.seasonModelJson);
  const spannedScopes = [...new Set(input.spannedScopeIds)].sort();
  const allScopeIds = [...new Set(input.allScopeIds)].sort();
  const spannedAll =
    spannedScopes.length === allScopeIds.length &&
    allScopeIds.every((scopeId, index) => scopeId === spannedScopes[index]);
  const excludedGroups = (model.groups ?? [])
    .filter((group) => group.planningStatus === "exclude")
    .map(groupKey);
  const excludedTeamIds = new Set(
    (model.groups ?? [])
      .filter((group) => group.planningStatus === "exclude")
      .flatMap((group) => group.teamIds ?? []),
  );
  const wishGaps = (model.teams ?? [])
    .filter((team) => !team.id || !excludedTeamIds.has(team.id))
    .map((team) => ({ teamId: team.id ?? "", missing: missingWishParts(team) }))
    .filter((gap) => gap.teamId && gap.missing.length);
  const capacityGaps = (input.capacityReview?.rows ?? [])
    .filter(
      (row): row is typeof row & { status: "missing" | "insufficient" } =>
        row.status === "missing" || row.status === "insufficient",
    )
    .map((row) => ({
      clubId: row.clubId,
      hall: row.hall,
      weekday: row.weekday,
      status: row.status,
    }));
  const complete =
    spannedAll &&
    excludedGroups.length === 0 &&
    wishGaps.length === 0 &&
    capacityGaps.length === 0;

  return {
    complete,
    spannedScopes,
    spannedAll,
    excludedGroups,
    wishGaps,
    capacityGaps,
  };
}

export async function buildCoverageRecordForInputSet(inputSetId: string) {
  const [{ prisma }, { reviewHallCapacitiesForInputSet }] = await Promise.all([
    import("@/lib/db"),
    import("@/services/raster/capacity"),
  ]);
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: {
      scopeId: true,
      seasonModelJson: true,
      spannedScopes: { select: { scopeId: true } },
    },
  });
  if (!inputSet) throw new Error("Input set not found");

  const allScopes = await prisma.scope.findMany({
    select: {
      id: true,
      parent: {
        select: { code: true, parent: { select: { code: true } } },
      },
    },
  });
  const capacityReview = await reviewHallCapacitiesForInputSet(inputSetId);

  return computeCoverageRecord({
    seasonModelJson: inputSet.seasonModelJson,
    spannedScopeIds: inputSet.spannedScopes.length
      ? inputSet.spannedScopes.map((scope) => scope.scopeId)
      : [inputSet.scopeId],
    allScopeIds: allScopes
      .filter(isSelectableRasterScope)
      .map((scope) => scope.id),
    capacityReview,
  });
}

export async function buildCoverageRecordForScopes(
  scopeIds: string[],
  season: string,
) {
  const [{ prisma }, { reviewHallCapacitiesForInputSet }] = await Promise.all([
    import("@/lib/db"),
    import("@/services/raster/capacity"),
  ]);
  const inputSets = await prisma.rasterInputSet.findMany({
    where: {
      scopeId: { in: scopeIds },
      season,
      seasonModelJson: { not: null },
    },
    orderBy: [{ scopeId: "asc" }, { createdAt: "desc" }],
    select: { id: true, scopeId: true, seasonModelJson: true },
  });
  const latestByScope = new Map<string, (typeof inputSets)[number]>();
  for (const inputSet of inputSets) {
    if (!latestByScope.has(inputSet.scopeId)) {
      latestByScope.set(inputSet.scopeId, inputSet);
    }
  }
  const allScopes = await prisma.scope.findMany({
    select: {
      id: true,
      parent: {
        select: { code: true, parent: { select: { code: true } } },
      },
    },
  });
  const records = await Promise.all(
    [...latestByScope.values()].map(async (inputSet) => ({
      inputSet,
      capacityReview: await reviewHallCapacitiesForInputSet(inputSet.id),
    })),
  );

  return computeCoverageRecord({
    seasonModelJson: JSON.stringify({
      groups: records.flatMap(
        ({ inputSet }) =>
          parseSeasonModel(inputSet.seasonModelJson).groups ?? [],
      ),
      teams: records.flatMap(
        ({ inputSet }) =>
          parseSeasonModel(inputSet.seasonModelJson).teams ?? [],
      ),
    }),
    spannedScopeIds: scopeIds,
    allScopeIds: allScopes
      .filter(isSelectableRasterScope)
      .map((scope) => scope.id),
    capacityReview: {
      rows: records.flatMap(({ capacityReview }) => capacityReview.rows),
    },
  });
}

function parseSeasonModel(value?: string | null): {
  groups?: SeasonGroup[];
  teams?: SeasonTeam[];
} {
  if (!value) return {};
  try {
    return JSON.parse(value) as {
      groups?: SeasonGroup[];
      teams?: SeasonTeam[];
    };
  } catch {
    return {};
  }
}

function groupKey(group: SeasonGroup) {
  return (
    group.id ??
    [group.ref?.league, group.ref?.name].filter(Boolean).join("::") ??
    ""
  );
}

function missingWishParts(team: SeasonTeam) {
  const missing: Array<"wish" | "gameDay" | "gym" | "startTime"> = [];
  if (!team.wishMatchId) missing.push("wish");
  if (!team.homeWeekday) missing.push("gameDay");
  if (!team.hall) missing.push("gym");
  if (!team.startTime) missing.push("startTime");
  return missing;
}
