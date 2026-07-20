import { prisma } from "@/lib/db";
import { normalizeRasterSeason } from "@/lib/raster/season";
import type {
  ParsedUpperLeagueImport,
  ParsedUpperLeagueEntry,
} from "../../../../src/raster/ingest/groups-pdf.js";

export const UPPER_LEAGUE_RASTER = "UPPER_LEAGUE_RASTER";

type Club = {
  id: string;
  name?: string;
  venues?: Array<{ hall?: string; name?: string; capacityByWeekday?: unknown }>;
};
type Team = {
  id: string;
  clubId: string;
  label?: string;
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
  wishMatchId?: string;
};
type Group = {
  ref?: { league?: string; name?: string };
  size?: number;
  teamIds?: string[];
};
type SeasonModel = {
  clubs?: Club[];
  teams?: Team[];
  groups?: Group[];
  upperLeague?: UpperLeagueCoverage;
  [key: string]: unknown;
};

export type UpperLeagueCoverage = {
  importPresent: boolean;
  matched: Array<{ clubId: string; label: string; rasterzahl: number }>;
  unmatched: Array<{ clubId: string; label: string }>;
  excludedNoHall: Array<{ clubId: string; label: string }>;
};

type InjectionParams = {
  inputSetId: string;
  scopeId: string;
  season: string;
  model: SeasonModel;
};

export async function applyUpperLeagueInjectionToInputSet(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: {
      id: true,
      scopeId: true,
      season: true,
      seasonModelJson: true,
      spannedScopes: { select: { scopeId: true } },
    },
  });
  if (!inputSet?.seasonModelJson || (inputSet.spannedScopes ?? []).length > 1) {
    return inputSet;
  }

  const model = JSON.parse(inputSet.seasonModelJson) as SeasonModel;
  const injected = await buildUpperLeagueInjection({
    inputSetId,
    scopeId: inputSet.scopeId,
    season: inputSet.season,
    model,
  });
  const nextModel = mergeInjection(model, injected);
  return prisma.rasterInputSet.update({
    where: { id: inputSetId },
    data: { seasonModelJson: JSON.stringify(nextModel) },
  });
}

export async function listUpperLeagueReview(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: {
      id: true,
      scopeId: true,
      season: true,
      seasonModelJson: true,
      spannedScopes: { select: { scopeId: true } },
    },
  });
  if (!inputSet?.seasonModelJson || (inputSet.spannedScopes ?? []).length > 1) {
    return null;
  }

  const model = JSON.parse(inputSet.seasonModelJson) as SeasonModel;
  const injected = await buildUpperLeagueInjection({
    inputSetId,
    scopeId: inputSet.scopeId,
    season: inputSet.season,
    model,
  });
  return injected.coverage;
}

export async function buildUpperLeagueInjection(params: InjectionParams) {
  const source = await prisma.rasterSource.findFirst({
    where: {
      scopeId: params.scopeId,
      season: normalizeRasterSeason(params.season),
      sourceType: UPPER_LEAGUE_RASTER,
      parsedJson: { not: null },
    },
    orderBy: { updatedAt: "desc" },
  });
  const coverage: UpperLeagueCoverage = {
    importPresent: Boolean(source?.parsedJson),
    matched: [],
    unmatched: [],
    excludedNoHall: [],
  };
  if (!source?.parsedJson) return { teams: [], groups: [], coverage };

  const parsed = JSON.parse(source.parsedJson) as ParsedUpperLeagueImport;
  const wishes = await prisma.rasterWish.findMany({
    where: { inputSetId: params.inputSetId },
    orderBy: [{ clubName: "asc" }, { teamLabel: "asc" }],
  });
  const modelTeams = new Set(
    (params.model.teams ?? []).map((team) => teamKey(team.clubId, team.label)),
  );
  const wishByTeam = new Map(
    wishes.map((wish) => [teamKey(wish.clubId, wish.teamLabel), wish]),
  );
  const matchedKeys = new Set<string>();
  const teams: Team[] = [];
  const groups = new Map<string, Group>();

  for (const league of parsed.leagues ?? []) {
    for (const entry of league.entries ?? []) {
      const match = matchScopeClub(params.model.clubs ?? [], entry);
      if (!match) continue;
      const label = teamLabel(league.league, match.suffix);
      const key = teamKey(match.club.id, label);
      matchedKeys.add(key);
      const wish = wishByTeam.get(key);
      if (!wish?.hall || !wish.homeWeekday) {
        coverage.excludedNoHall.push({ clubId: match.club.id, label });
        continue;
      }

      const id = `upper-${slug(league.league)}-${slug(entry.team)}`;
      const groupKey = `${league.league}\0${league.size}`;
      const group = groups.get(groupKey) ?? {
        ref: { league: league.league, name: league.league },
        size: league.size,
        teamIds: [],
      };
      group.teamIds = [...(group.teamIds ?? []), id];
      groups.set(groupKey, group);
      teams.push({
        id,
        clubId: match.club.id,
        label,
        homeWeekday: String(wish.homeWeekday).toLowerCase(),
        hall: wish.hall,
        ...(wish.startTime ? { startTime: wish.startTime } : {}),
        wishMatchId: wish.id,
        planned: false,
        capacityRelevant: true,
        confidence: "ok",
        group: group.ref,
        rasterzahl: { kind: "fixed", value: entry.rasterzahl },
      } as Team);
      coverage.matched.push({
        clubId: match.club.id,
        label,
        rasterzahl: entry.rasterzahl,
      });
    }
  }

  for (const wish of wishes) {
    const label = wish.teamLabel ?? "";
    const key = teamKey(wish.clubId, label);
    if (!label || modelTeams.has(key) || matchedKeys.has(key)) continue;
    if (looksUpperLeagueRelevant(label)) {
      coverage.unmatched.push({ clubId: wish.clubId, label });
    }
  }

  return { teams, groups: [...groups.values()], coverage };
}

export function mergeInjection(
  model: SeasonModel,
  injected: Awaited<ReturnType<typeof buildUpperLeagueInjection>>,
): SeasonModel {
  const injectedIds = new Set(injected.teams.map((team) => team.id));
  return {
    ...model,
    teams: [
      ...(model.teams ?? []).filter((team) => !String(team.id).startsWith("upper-")),
      ...injected.teams,
    ],
    groups: [
      ...(model.groups ?? []).filter(
        (group) => !(group.teamIds ?? []).some((teamId) => injectedIds.has(String(teamId))),
      ),
      ...injected.groups,
    ],
    upperLeague: injected.coverage,
  };
}

function matchScopeClub(clubs: Club[], entry: ParsedUpperLeagueEntry) {
  for (const club of clubs) {
    const name = club.name?.trim();
    if (!name) continue;
    if (entry.team === name) return { club, suffix: "" };
    const suffix = entry.team.slice(name.length).trim();
    if (
      entry.team.startsWith(`${name} `) &&
      /^(II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(suffix)
    ) {
      return { club, suffix: suffix.toUpperCase() };
    }
  }
  return null;
}

function teamLabel(league: string, suffix: string) {
  const base = /\bmädchen\b/i.test(league)
    ? "Mädchen"
    : /\bjugend\b/i.test(league)
      ? "Jugend"
      : /\bdamen\b/i.test(league)
        ? "Damen"
        : "Erwachsene";
  return [base, suffix].filter(Boolean).join(" ");
}

function looksUpperLeagueRelevant(label: string) {
  return /\b(erwachsene|damen|jugend|mädchen)\b/i.test(label);
}

function teamKey(clubId: string | null | undefined, label: string | null | undefined) {
  return `${clubId ?? ""}\0${(label ?? "").trim().toLowerCase()}`;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
}
