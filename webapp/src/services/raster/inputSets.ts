import { prisma } from "@/lib/db";
import { rasterDistrictWhere } from "@/lib/raster/access";
import { rasterIngest } from "@/lib/raster/pipeline";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { seasonModelSchema, type SeasonModelInput } from "@/lib/raster/schemas";
import { InputSetStatus } from "../../../generated/prisma/enums";
import type {
  TeamRasterAssignmentRow,
  WishParseResult,
} from "../../../../src/raster/ingest/index.js";
import { listRasterSourcesForDistrict } from "./sources";
import { replaceParsedWishes } from "./wishes";
import { reviewHallCapacitiesForInputSet } from "./capacity";

type SeasonGroup = {
  id?: string;
  ref?: { league?: string; name?: string };
  size?: number;
  rasterMode?: "single" | "double";
};

type SeasonModelClub = { id: string; name?: string };
type SeasonModelTeam = { id: string; clubId: string };
type SeasonModelWithClubs = {
  clubs?: SeasonModelClub[];
  teams?: SeasonModelTeam[];
};

export async function listInputSets(
  district: string,
  season = normalizeRasterSeason(undefined),
) {
  return prisma.rasterInputSet.findMany({
    where: { ...rasterDistrictWhere(district), season: normalizeRasterSeason(season) },
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
      runs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { snapshot: { select: { id: true } } },
      },
      _count: {
        select: { wishes: true, fixedRasterzahlen: true, runs: true },
      },
    },
  });
}

export async function createInputSet(params: {
  district: string;
  season: string;
  name: string;
  createdById: string;
}) {
  return prisma.rasterInputSet.create({
    data: { ...params, season: normalizeRasterSeason(params.season) },
  });
}

export async function getInputSet(id: string) {
  return prisma.rasterInputSet.findUnique({
    where: { id },
    include: {
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
      for (const group of parsed.data.groups as SeasonGroup[]) {
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
    }
  }
  const capacityReview = await reviewHallCapacitiesForInputSet(id);
  if (capacityReview.blockingCount > 0) {
    errors.push(
      `Hall capacity review needed: ${capacityReview.missingCount} missing, ${capacityReview.insufficientCount} lower than inferred.`,
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

export async function syncInputSetSourceCaches(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: { id: true, district: true, season: true, seasonModelJson: true },
  });
  if (!inputSet) return null;

  const sources = await listRasterSourcesForDistrict(
    inputSet.district,
    inputSet.season,
  );
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
      const supportedSizes = new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      const supportedAssignments = parsed.assignments.filter((assignment) =>
        supportedSizes.has(groupSizes.get(assignment.group) ?? 0),
      );
      const skippedGroups = [...groupSizes.entries()].filter(
        ([, size]) => !supportedSizes.has(size),
      );
      const model =
        await rasterIngest.buildSeasonModelFromAssignments(supportedAssignments);
      alignSeasonModelClubIds(model, parsedWishes);
      const existingModes = groupModesByKey(inputSet.seasonModelJson);
      model.groups = model.groups.map((group) => ({
        ...group,
        rasterMode: group.rasterMode ?? existingModes.get(groupKey(group)),
      }));
      model.warnings.push(
        ...skippedGroups.map(
          ([group, size]) =>
            `Skipped ${group}: unsupported group size ${size}.`,
        ),
      );
      data.seasonModelJson = JSON.stringify(model);
    }
  }
  if (wishSources.length) {
    data.wishesJson = JSON.stringify({
      sources: wishSources.map((source, index) => ({
        sourceId: source.id,
        sourceRef: source.sourceRef,
        parsed: parsedWishes[index],
      })),
    });
    await replaceParsedWishes(inputSet.id, {
      clubs: parsedWishes.flatMap((parsed) => parsed.clubs ?? []),
      teams: parsedWishes.flatMap((parsed) => parsed.teams ?? []),
      warnings: parsedWishes.flatMap((parsed) => parsed.warnings ?? []),
    });
  }
  if (!data.groupAssignmentJson && !data.wishesJson && !data.seasonModelJson) {
    return inputSet;
  }

  return prisma.rasterInputSet.update({
    where: { id: inputSet.id },
    data,
  });
}

function alignSeasonModelClubIds(
  model: SeasonModelWithClubs,
  parsedWishes: WishParseResult[],
) {
  const wishClubIdByName = new Map<string, string>();
  for (const club of parsedWishes.flatMap((parsed) => parsed.clubs ?? [])) {
    wishClubIdByName.set(normalizeClubName(club.name), club.id);
  }
  const clubIdMap = new Map<string, string>();
  model.clubs = (model.clubs ?? []).map((club) => {
    const wishClubId = wishClubIdByName.get(normalizeClubName(club.name));
    if (!wishClubId || wishClubId === club.id) return club;
    clubIdMap.set(club.id, wishClubId);
    return { ...club, id: wishClubId };
  });
  if (!clubIdMap.size) return;
  model.teams = (model.teams ?? []).map((team) => ({
    ...team,
    clubId: clubIdMap.get(team.clubId) ?? team.clubId,
  }));
}

function normalizeClubName(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function groupModesByKey(seasonModelJson?: string | null) {
  const modes = new Map<string, "single" | "double">();
  if (!seasonModelJson) return modes;
  try {
    const model = JSON.parse(seasonModelJson) as { groups?: SeasonGroup[] };
    for (const group of model.groups ?? []) {
      if (group.rasterMode === "single" || group.rasterMode === "double") {
        modes.set(groupKey(group), group.rasterMode);
      }
    }
  } catch {
    return modes;
  }
  return modes;
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
