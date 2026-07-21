import { prisma } from "@/lib/db";
import { rasterScopeWhere } from "@/lib/raster/access";
import { rasterIngest } from "@/lib/raster/pipeline";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { seasonModelSchema, type SeasonModelInput } from "@/lib/raster/schemas";
import { closestClubId, normalizeClubName } from "@/lib/raster/club-matching";
import { InputSetStatus } from "../../../generated/prisma/enums";
import type { TeamRasterAssignmentRow } from "../../../../src/raster/ingest/clicktt-assignments.js";
import type { WishParseResult } from "../../../../src/raster/ingest/wishes-pdf.js";
import { extractRelationalWishes } from "../../../../src/raster/ingest/wishes-freetext.js";
import type { Team } from "../../../../src/raster/types.js";
import {
  adoptLegacyRasterSources,
  listRasterSourcesForInputSet,
} from "./sources";
import { importParsedWishes } from "./wishes";
import { reviewHallCapacitiesForInputSet } from "./capacity";

const INPUT_SET_SOURCE_TYPES = [
  "GROUP_ASSIGNMENT",
  "WISHES_PDF",
  "ROSTER_CSV",
  "UPPER_LEAGUE_RASTER",
];

export class DuplicateInputSetNameError extends Error {
  constructor() {
    super("Planning set name already exists for this scope and season.");
  }
}

type SeasonGroup = {
  id?: string;
  ref?: { league?: string; name?: string };
  size?: number;
  rasterMode?: "single" | "double";
  planningStatus?: "include" | "exclude";
  teamIds?: string[];
};

type SeasonModelClub = {
  id: string;
  name?: string;
  notes?: string;
  venues?: unknown[];
};
type SeasonModelTeam = {
  id: string;
  clubId: string;
  label?: string;
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
  spielwochePref?: string;
  requestedRasterzahl?: number[];
  wishMatchId?: string;
  wishMatchSource?: "auto" | "manual";
  confidence?: "ok" | "review";
};
type SeasonModelWithClubs = {
  clubs?: SeasonModelClub[];
  teams?: SeasonModelTeam[];
  wishes?: unknown[];
};

export async function listInputSets(
  scopeId: string,
  season = normalizeRasterSeason(undefined),
) {
  const inputSets = await prisma.rasterInputSet.findMany({
    where: {
      ...rasterScopeWhere(scopeId),
      season: normalizeRasterSeason(season),
    },
    orderBy: { createdAt: "desc" },
    include: {
      fixedRasterzahlen: {
        orderBy: [{ clubId: "asc" }, { teamLabel: "asc" }],
        select: {
          clubId: true,
          teamLabel: true,
          rasterzahl: true,
          source: true,
        },
      },
      wishes: {
        orderBy: [{ clubName: "asc" }, { teamLabel: "asc" }],
        select: {
          id: true,
          clubId: true,
          clubName: true,
          teamLabel: true,
          homeWeekday: true,
          hall: true,
          startTime: true,
          spielwochePref: true,
          requestedRasterzahl: true,
        },
      },
      runs: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { snapshot: { select: { id: true } } },
      },
      spannedScopes: { select: { scopeId: true } },
      _count: {
        select: { wishes: true, fixedRasterzahlen: true, runs: true },
      },
    },
  });
  return Promise.all(
    inputSets.map(async (inputSet) => {
      const spannedScopes = inputSet.spannedScopes ?? [];
      const scopeIds =
        spannedScopes.length > 1
          ? spannedScopes.map((scope) => scope.scopeId)
          : [inputSet.scopeId];
      const rawRuns = inputSet.runs ?? [];
      const runs = await Promise.all(
        rawRuns.map(async (run) => ({
          ...run,
          sourceChangedSinceStart:
            (await prisma.rasterSource.count({
              where: {
                inputSetId: inputSet.id,
                sourceType: { in: INPUT_SET_SOURCE_TYPES },
                updatedAt: { gt: run.createdAt },
              },
            })) > 0,
        })),
      );
      return { ...inputSet, runs };
    }),
  );
}

export async function createInputSet(params: {
  scopeId: string;
  season: string;
  name?: string;
  createdById: string;
}) {
  const scope = await prisma.scope.findUnique({
    where: { id: params.scopeId },
    select: { code: true },
  });
  const season = normalizeRasterSeason(params.season);
  const name =
    params.name?.trim() || `${scope?.code ?? params.scopeId} ${season}`;
  const existing = await prisma.rasterInputSet.findFirst({
    where: { scopeId: params.scopeId, season, name },
    select: { id: true },
  });
  if (existing) throw new DuplicateInputSetNameError();

  const inputSet = await prisma.rasterInputSet.create({
    data: {
      ...params,
      name,
      season,
    },
  });
  await adoptLegacyRasterSources(inputSet.id);
  return inputSet;
}

export async function getInputSet(id: string) {
  return prisma.rasterInputSet.findUnique({
    where: { id },
    include: {
      scope: true,
      _count: {
        select: { wishes: true, fixedRasterzahlen: true },
      },
    },
  });
}

export async function validateInputSet(id: string) {
  await syncInputSetSourceCaches(id);
  const inputSet = await getInputSet(id);
  if (!inputSet) return null;

  const errors = [];
  if (inputSet._count.wishes === 0) {
    errors.push("At least one wish/team row is required.");
  }
  if (!inputSet.seasonModelJson) {
    errors.push("A structured season model is required.");
  } else {
    const parsed = seasonModelSchema.safeParse(
      JSON.parse(inputSet.seasonModelJson),
    );
    if (!parsed.success) {
      errors.push("The structured season model is invalid.");
    } else {
      errors.push(...validateSeasonModelGroups(parsed.data));
      const undecidedGroups = groupsWithMissingWishData(parsed.data).filter(
        (group) =>
          group.planningStatus !== "include" &&
          group.planningStatus !== "exclude",
      );
      if (undecidedGroups.length) {
        errors.push(
          `${undecidedGroups.length} group(s) contain teams without parsed wish PDFs: ${undecidedGroups
            .map(groupLabel)
            .join("; ")}. Choose include or exclude before running.`,
        );
      }
    }
  }
  const capacityReview = await reviewHallCapacitiesForInputSet(id);
  if (capacityReview.blockingCount > 0) {
    errors.push(
      `Review gym capacities: ${capacityReview.missingCount} missing, ${capacityReview.insufficientCount} lower than inferred.`,
    );
  }

  const status = errors.length ? InputSetStatus.DRAFT : InputSetStatus.READY;
  if (inputSet.status !== status) {
    await prisma.rasterInputSet.update({
      where: { id },
      data: { status },
    });
  }

  return { inputSet: { ...inputSet, status }, errors, capacityReview };
}

function validateSeasonModelGroups(model: SeasonModelInput) {
  const errors: string[] = [];
  for (const group of model.groups as SeasonGroup[]) {
    if (group.planningStatus === "exclude") continue;
    if (Number(group.size) < 5 || Number(group.size) > 12) {
      errors.push(
        `Group ${groupLabel(group)} has ${group.size} teams; only 5..12 are supported.`,
      );
      continue;
    }
    if (
      Number(group.size) === 6 &&
      group.rasterMode !== "single" &&
      group.rasterMode !== "double"
    ) {
      errors.push(
        `Six-team group ${groupLabel(group)} needs normal 6er or 6er Doppelrunde confirmation.`,
      );
    }
  }
  return errors;
}

export async function syncInputSetSourceCaches(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: {
      id: true,
      scopeId: true,
      season: true,
      seasonModelJson: true,
      createdById: true,
      wishesJson: true,
    },
  });
  if (!inputSet) return null;

  const sources = (await listRasterSourcesForInputSet(inputSet.id)) ?? [];
  const groupSource = sources.find(
    (source) =>
      source.sourceType.toUpperCase() === "GROUP_ASSIGNMENT" &&
      source.parsedJson,
  );
  const wishSources = sources.filter(
    (source) =>
      source.sourceType.toUpperCase() === "WISHES_PDF" && source.parsedJson,
  );
  const parsedWishes = wishSources.map(
    (source) => JSON.parse(source.parsedJson ?? "{}") as WishParseResult,
  );
  const data: {
    seasonModelJson?: string;
    groupAssignmentJson?: string;
    wishesJson?: string;
  } = {};
  let importedWishes = false;
  if (wishSources.length) {
    data.wishesJson = stringifyWishSources(wishSources, parsedWishes);
  }
  if (groupSource?.parsedJson) {
    data.groupAssignmentJson = groupSource.parsedJson;
    const parsed = JSON.parse(groupSource.parsedJson) as {
      assignments?: TeamRasterAssignmentRow[];
    };
    if (parsed.assignments?.length) {
      const groupSizes = new Map<string, number>();
      for (const assignment of parsed.assignments) {
        groupSizes.set(
          assignment.group,
          (groupSizes.get(assignment.group) ?? 0) + 1,
        );
      }
      const supportedSizes = new Set([5, 6, 7, 8, 9, 10, 11, 12]);
      const supportedAssignments = parsed.assignments.filter((assignment) =>
        supportedSizes.has(groupSizes.get(assignment.group) ?? 0),
      );
      const skippedGroups = [...groupSizes.entries()].filter(
        ([, size]) => !supportedSizes.has(size),
      );
      const manualWishMatches = manualWishMatchesByTeamId(
        inputSet.seasonModelJson,
      );
      const model =
        await rasterIngest.buildSeasonModelFromAssignments(
          supportedAssignments,
        );
      alignParsedWishClubIds(model, parsedWishes);
      if (wishSources.length) {
        data.wishesJson = stringifyWishSources(wishSources, parsedWishes);
        await importWishesIfChanged(inputSet, parsedWishes, data.wishesJson);
        importedWishes = true;
      }
      await applyActiveWishDetails(
        model,
        inputSet.id,
        parsedWishes,
        manualWishMatches,
      );
      const existingReviews = groupReviewsByKey(inputSet.seasonModelJson);
      model.groups = model.groups.map((group) => ({
        ...group,
        rasterMode:
          group.rasterMode ?? existingReviews.get(groupKey(group))?.rasterMode,
        planningStatus:
          (group as SeasonGroup).planningStatus ??
          existingReviews.get(groupKey(group))?.planningStatus,
      }));
      applyPlanningStatusToTeamCapacity(model);
      model.warnings.push(
        ...skippedGroups.map(
          ([group, size]) =>
            `Skipped ${group}: unsupported group size ${size}.`,
        ),
      );
      data.seasonModelJson = JSON.stringify(model);
    }
  }
  if (wishSources.length && !importedWishes && data.wishesJson) {
    await importWishesIfChanged(inputSet, parsedWishes, data.wishesJson);
  }
  if (!data.groupAssignmentJson && !data.wishesJson && !data.seasonModelJson) {
    return inputSet;
  }

  return prisma.rasterInputSet.update({
    where: { id: inputSet.id },
    data,
  });
}

// syncInputSetSourceCaches runs on every optimizer start. Importing
// unconditionally opened an import batch -- and a fresh unmatched row per
// unpaired team -- on every run, so the review listed the same team once per
// run. The stored wishesJson is the parsed union, so comparing against it
// tells us whether there is anything new to import.
async function importWishesIfChanged(
  inputSet: { id: string; createdById: string; wishesJson: string | null },
  parsedWishes: WishParseResult[],
  nextWishesJson: string,
) {
  if (nextWishesJson === inputSet.wishesJson) return;
  await importParsedWishes({
    inputSetId: inputSet.id,
    startedById: inputSet.createdById,
    parsed: mergeParsedWishes(parsedWishes),
  });
}

function mergeParsedWishes(parsedWishes: WishParseResult[]): WishParseResult {
  return {
    clubs: parsedWishes.flatMap((parsed) => parsed.clubs ?? []),
    teams: parsedWishes.flatMap((parsed) => parsed.teams ?? []),
    warnings: parsedWishes.flatMap((parsed) => parsed.warnings ?? []),
  };
}

function stringifyWishSources(
  wishSources: { id: string; sourceRef: string; parsedJson?: string | null }[],
  parsedWishes: WishParseResult[],
) {
  return JSON.stringify({
    sources: wishSources.map((source, index) => ({
      sourceId: source.id,
      sourceRef: source.sourceRef,
      parsed: parsedWishes[index],
    })),
  });
}

function alignParsedWishClubIds(
  model: SeasonModelWithClubs,
  parsedWishes: WishParseResult[],
) {
  const modelClubIdByName = new Map<string, string>();
  for (const club of model.clubs ?? []) {
    modelClubIdByName.set(normalizeClubName(club.name), club.id);
  }
  const clubIdMap = new Map<string, string>();
  for (const parsed of parsedWishes) {
    parsed.clubs = (parsed.clubs ?? []).map((club) => {
      const modelClubId =
        modelClubIdByName.get(normalizeClubName(club.name)) ??
        closestClubId(normalizeClubName(club.name), modelClubIdByName);
      if (!modelClubId || modelClubId === club.id) return club;
      clubIdMap.set(club.id, modelClubId);
      return { ...club, id: modelClubId };
    });
  }
  if (!clubIdMap.size) return;
  for (const parsed of parsedWishes) {
    parsed.teams = (parsed.teams ?? []).map((team) => ({
      ...team,
      clubId: clubIdMap.get(team.clubId) ?? team.clubId,
    }));
  }
}

async function applyActiveWishDetails(
  model: SeasonModelWithClubs,
  inputSetId: string,
  parsedWishes: WishParseResult[],
  manualWishMatches = new Map<string, string>(),
) {
  const wishClubById = new Map(
    parsedWishes
      .flatMap((parsed) => parsed.clubs ?? [])
      .map((club) => [club.id, club]),
  );
  model.clubs = (model.clubs ?? []).map((club) => {
    const wishClub = wishClubById.get(club.id);
    if (!wishClub) return club;
    return {
      ...club,
      venues: wishClub.venues?.length ? wishClub.venues : club.venues,
      notes: wishClub.notes ?? club.notes,
    };
  });

  const activeWishes = await prisma.rasterWish.findMany({
    where: { inputSetId },
  });
  const wishTeamByClubAndLabel = new Map(
    activeWishes.map((wish) => [
      teamIdentityKey(wish.clubId, wish.teamLabel ?? undefined),
      wish,
    ]),
  );
  model.teams = (model.teams ?? []).map((team) => {
    const wishTeam = wishTeamByClubAndLabel.get(
      teamIdentityKey(team.clubId, team.label),
    );
    if (!wishTeam) return team;
    return applyWishToTeam(team, wishTeam, team.wishMatchSource ?? "auto");
  });

  const activeWishById = new Map(activeWishes.map((wish) => [wish.id, wish]));
  model.teams = (model.teams ?? []).map((team) => {
    const wishId = manualWishMatches.get(team.id);
    const wish = wishId ? activeWishById.get(wishId) : undefined;
    return wish ? applyWishToTeam(team, wish, "manual") : team;
  });
  model.wishes = (model.clubs ?? []).flatMap((club) =>
    extractRelationalWishes(
      club.id,
      club.notes ?? "",
      (model.teams ?? []) as Team[],
    ),
  );
}

function applyWishToTeam(
  team: SeasonModelTeam,
  wishTeam: {
    id: string;
    clubId: string;
    homeWeekday: string;
    hall?: string | null;
    startTime?: string | null;
    spielwochePref?: string | null;
    requestedRasterzahl?: string | null;
    confidence?: string | null;
  },
  wishMatchSource: "auto" | "manual",
) {
  return {
    ...team,
    clubId: wishTeam.clubId,
    homeWeekday: wishTeam.homeWeekday.toLowerCase(),
    ...(wishTeam.hall ? { hall: wishTeam.hall } : {}),
    ...(wishTeam.startTime ? { startTime: wishTeam.startTime } : {}),
    ...(wishTeam.spielwochePref
      ? { spielwochePref: wishTeam.spielwochePref }
      : {}),
    ...(wishTeam.requestedRasterzahl
      ? { requestedRasterzahl: JSON.parse(wishTeam.requestedRasterzahl) }
      : {}),
    wishMatchId: wishTeam.id,
    wishMatchSource,
    confidence: wishTeam.confidence === "OK" ? "ok" : "review",
    capacityRelevant: true,
  };
}

function manualWishMatchesByTeamId(seasonModelJson?: string | null) {
  const matches = new Map<string, string>();
  if (!seasonModelJson) return matches;
  try {
    const model = JSON.parse(seasonModelJson) as {
      teams?: Array<{
        id?: string;
        wishMatchId?: string;
        wishMatchSource?: string;
      }>;
    };
    for (const team of model.teams ?? []) {
      if (
        team.id &&
        team.wishMatchId &&
        team.wishMatchSource === "manual"
      ) {
        matches.set(team.id, team.wishMatchId);
      }
    }
  } catch {
    return matches;
  }
  return matches;
}

function teamIdentityKey(
  clubId: string | undefined,
  label: string | undefined,
) {
  return `${clubId ?? ""}|${(label ?? "").trim().toLowerCase()}`;
}

function groupReviewsByKey(seasonModelJson?: string | null) {
  const reviews = new Map<
    string,
    {
      rasterMode?: "single" | "double";
      planningStatus?: "include" | "exclude";
    }
  >();
  if (!seasonModelJson) return reviews;
  try {
    const model = JSON.parse(seasonModelJson) as { groups?: SeasonGroup[] };
    for (const group of model.groups ?? []) {
      const review: {
        rasterMode?: "single" | "double";
        planningStatus?: "include" | "exclude";
      } = {};
      if (group.rasterMode === "single" || group.rasterMode === "double") {
        review.rasterMode = group.rasterMode;
      }
      if (
        group.planningStatus === "include" ||
        group.planningStatus === "exclude"
      ) {
        review.planningStatus = group.planningStatus;
      }
      if (review.rasterMode || review.planningStatus) {
        reviews.set(groupKey(group), review);
      }
    }
  } catch {
    return reviews;
  }
  return reviews;
}

export async function updateSeasonModel(
  inputSetId: string,
  model: SeasonModelInput,
) {
  const parsed = seasonModelSchema.parse(model);
  return prisma.rasterInputSet.update({
    where: { id: inputSetId },
    data: {
      seasonModelJson: JSON.stringify(parsed),
      groupAssignmentJson: JSON.stringify(parsed.groups),
      status: InputSetStatus.DRAFT,
    },
  });
}

export async function updateGroupRasterMode(
  inputSetId: string,
  groupId: string,
  rasterMode: "single" | "double",
) {
  const inputSet = await getInputSet(inputSetId);
  if (!inputSet?.seasonModelJson) return null;

  const model = seasonModelSchema.parse(JSON.parse(inputSet.seasonModelJson));
  let updated = false;
  model.groups = (model.groups as SeasonGroup[]).map((group) => {
    if (groupKey(group) !== groupId) return group;
    updated = true;
    return { ...group, rasterMode };
  });
  if (!updated) return null;

  return updateSeasonModel(inputSetId, model);
}

export async function updateGroupPlanningStatus(
  inputSetId: string,
  groupId: string,
  planningStatus: "include" | "exclude",
) {
  const inputSet = await getInputSet(inputSetId);
  if (!inputSet?.seasonModelJson) return null;

  const model = seasonModelSchema.parse(JSON.parse(inputSet.seasonModelJson));
  let updated = false;
  model.groups = (model.groups as SeasonGroup[]).map((group) => {
    if (groupKey(group) !== groupId) return group;
    updated = true;
    return { ...group, planningStatus };
  });
  if (!updated) return null;
  applyPlanningStatusToTeamCapacity(model);

  return updateSeasonModel(inputSetId, model);
}

export async function updateTeamWishFields(
  inputSetId: string,
  teamId: string,
  fields: { spielwochePref?: "A" | "B" | null; wishId?: string },
) {
  const inputSet = await getInputSet(inputSetId);
  if (!inputSet?.seasonModelJson) return null;
  const wish = fields.wishId
    ? await prisma.rasterWish.findFirst({
        where: { id: fields.wishId, inputSetId },
      })
    : null;

  const model = seasonModelSchema.parse(JSON.parse(inputSet.seasonModelJson));
  let updated = false;
  model.teams = (
    model.teams as Array<Record<string, unknown> & { id?: string }>
  ).map((team) => {
    if (team.id !== teamId) return team;
    updated = true;
    const next = { ...team };
    if (wish) {
      next.clubId = wish.clubId;
      next.homeWeekday = wish.homeWeekday.toLowerCase();
      next.hall = wish.hall;
      next.startTime = wish.startTime;
      next.spielwochePref = wish.spielwochePref;
      next.requestedRasterzahl = wish.requestedRasterzahl
        ? JSON.parse(wish.requestedRasterzahl)
        : undefined;
      next.wishMatchId = wish.id;
      next.wishMatchSource = "manual";
      next.capacityRelevant = true;
      next.confidence = "review";
    }
    if (fields.spielwochePref === null) {
      delete next.spielwochePref;
    } else if (fields.spielwochePref) {
      next.spielwochePref = fields.spielwochePref;
    }
    return next;
  });
  if (!updated) return null;
  if (wish) {
    const clubs = model.clubs as Array<
      Record<string, unknown> & { id?: string }
    >;
    if (!clubs.some((club) => club.id === wish.clubId)) {
      clubs.push({
        id: wish.clubId,
        name: wish.clubName,
        venues: [{ hall: wish.hall ?? "1", name: `Gym ${wish.hall ?? "1"}` }],
        notes: wish.notes ?? "",
      });
    }
  }

  return updateSeasonModel(inputSetId, model);
}

function groupsWithMissingWishData(model: SeasonModelInput) {
  const teams = new Map(
    (model.teams as Array<{ id?: string; capacityRelevant?: boolean }>).map(
      (team) => [team.id, team],
    ),
  );
  return (model.groups as SeasonGroup[]).filter((group) =>
    group.teamIds?.some(
      (teamId) => teams.get(teamId)?.capacityRelevant === false,
    ),
  );
}

function applyPlanningStatusToTeamCapacity(model: {
  groups: SeasonGroup[];
  teams: Array<{
    id?: string;
    wishMatchId?: unknown;
    capacityRelevant?: boolean;
  }>;
}) {
  const teamStatus = new Map<string, "include" | "exclude">();
  for (const group of model.groups as SeasonGroup[]) {
    if (
      group.planningStatus !== "include" &&
      group.planningStatus !== "exclude"
    ) {
      continue;
    }
    for (const teamId of group.teamIds ?? [])
      teamStatus.set(teamId, group.planningStatus);
  }
  model.teams = (
    model.teams as Array<Record<string, unknown> & { id?: string }>
  ).map((team) => {
    const status = team.id ? teamStatus.get(team.id) : undefined;
    if (status === "exclude") return { ...team, capacityRelevant: false };
    if (status === "include" && team.wishMatchId)
      return { ...team, capacityRelevant: true };
    return team;
  });
}

function groupKey(group: SeasonGroup) {
  return (
    group.id ??
    [group.ref?.league, group.ref?.name].filter(Boolean).join("::") ??
    ""
  );
}

function groupLabel(group: SeasonGroup) {
  return groupKey(group) || "(unnamed)";
}
