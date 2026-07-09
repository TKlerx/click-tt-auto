import { parseGroupsPdf } from "./groups-pdf.js";
import type { TeamRasterAssignmentRow } from "./clicktt-assignments.js";
import { extractRelationalWishes } from "./wishes-freetext.js";
import { parseWishesPdf } from "./wishes-pdf.js";
import { rasterSizeForGroupSize } from "../rulebook/rulebook.js";
import type { Club, SeasonModel, Team } from "../types.js";

export async function buildSeasonModel(
  wishPaths: string[],
  groupsPath: string
): Promise<SeasonModel> {
  const parsedWishes = await Promise.all(
    wishPaths.map((filePath) => parseWishesPdf(filePath))
  );
  const clubs = parsedWishes.flatMap((result) => result.clubs);
  const teams = parsedWishes.flatMap((result) => result.teams);
  const warnings = parsedWishes.flatMap((result) => result.warnings);
  const parsedGroups = await parseGroupsPdf(groupsPath, teams);

  for (const group of parsedGroups.groups) {
    rasterSizeForGroupSize(group.size);
    for (const teamId of group.teamIds) {
      const team = teams.find((candidate) => candidate.id === teamId);
      if (team) team.group = group.ref;
    }
  }

  for (const [teamId, value] of parsedGroups.fixed) {
    const team = teams.find((candidate) => candidate.id === teamId);
    if (team) team.rasterzahl = { kind: "fixed", value };
  }

  return {
    clubs,
    teams,
    groups: parsedGroups.groups,
    wishes: clubs.flatMap((club) =>
      extractRelationalWishes(club.id, club.notes, teams)
    ),
    absoluteConstraints: [],
    warnings: [...warnings, ...parsedGroups.warnings]
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitTeamName(team: string): { clubName: string; label: string } {
  const suffix = team.match(/\s+(II|III|IV|V|VI|VII|VIII|IX|X)$/i)?.[1];
  return {
    clubName: suffix ? team.slice(0, -suffix.length).trim() : team,
    label: suffix ? `Erwachsene ${suffix.toUpperCase()}` : "Erwachsene"
  };
}

function rowKey(row: TeamRasterAssignmentRow): string {
  return `${row.league?.toLowerCase() ?? ""}|${row.group.toLowerCase()}|${row.division?.toLowerCase() ?? ""}|${row.team.toLowerCase()}`;
}

function groupTeamKey(row: TeamRasterAssignmentRow): string {
  return `${row.group.toLowerCase()}|${row.division?.toLowerCase() ?? ""}|${row.team.toLowerCase()}`;
}

function legacyGroupTeamKey(row: TeamRasterAssignmentRow): string {
  return `${row.group.toLowerCase()}|${row.team.toLowerCase()}`;
}

function teamKey(row: TeamRasterAssignmentRow): string {
  return row.team.toLowerCase();
}

export async function buildSeasonModelFromAssignments(
  rows: TeamRasterAssignmentRow[],
  wishFilesByUrl: Map<string, string> = new Map(),
  fixedRows: TeamRasterAssignmentRow[] = []
): Promise<SeasonModel> {
  const fixed = new Set(fixedRows.map(rowKey));
  const fixedByGroupTeam = new Set(fixedRows.filter((row) => !row.league).map(groupTeamKey));
  const fixedByLegacyGroupTeam = new Set(
    fixedRows.filter((row) => !row.league && !row.division).map(legacyGroupTeamKey)
  );
  const fixedTeamCounts = new Map<string, number>();
  for (const row of fixedRows.filter((candidate) => !candidate.league && !candidate.group && !candidate.division)) {
    fixedTeamCounts.set(teamKey(row), (fixedTeamCounts.get(teamKey(row)) ?? 0) + 1);
  }
  const fixedByUniqueTeam = new Set(
    fixedRows
      .filter((row) => !row.league && !row.group && !row.division && fixedTeamCounts.get(teamKey(row)) === 1)
      .map(teamKey)
  );
  const parsedByUrl = new Map(
    await Promise.all(
      [...wishFilesByUrl.entries()].map(async ([url, filePath]) => [
        url,
        await parseWishesPdf(filePath)
      ] as const)
    )
  );
  const clubs = new Map<string, Club>();
  const teams: Team[] = [];
  const groups: SeasonModel["groups"] = [];

  for (const row of rows) {
    const { clubName, label } = splitTeamName(row.team);
    const clubId = slug(clubName);
    const parsed = row.wishUrl ? parsedByUrl.get(row.wishUrl) : undefined;
    const parsedClub = parsed?.clubs[0];
    const parsedTeam = parsed?.teams.find((team) => team.label.toLowerCase() === label.toLowerCase());

    clubs.set(clubId, {
      id: clubId,
      name: clubName,
      venues: parsedClub?.venues ?? [{ hall: "1", name: "Halle 1" }],
      notes: parsedClub?.notes ?? ""
    });

    const teamId = `${slug(row.group)}-${row.rasterzahl}-${slug(row.team)}`;
    teams.push({
      id: teamId,
      clubId,
      name: row.team,
      label,
      group: { league: row.league ?? row.division ?? "click-TT", name: row.group },
      homeWeekday: parsedTeam?.homeWeekday ?? "friday",
      hall: parsedTeam?.hall ?? "1",
      ...(parsedTeam?.startTime ? { startTime: parsedTeam.startTime } : {}),
      ...(parsedTeam?.spielwochePref ? { spielwochePref: parsedTeam.spielwochePref } : {}),
      ...(parsedTeam?.requestedRasterzahl ? { requestedRasterzahl: parsedTeam.requestedRasterzahl } : {}),
      rasterzahl:
        fixed.has(rowKey(row)) ||
        fixedByGroupTeam.has(groupTeamKey(row)) ||
        fixedByLegacyGroupTeam.has(legacyGroupTeamKey(row)) ||
        fixedByUniqueTeam.has(teamKey(row))
          ? { kind: "fixed", value: row.rasterzahl }
          : { kind: "assignable" },
      confidence: parsedTeam ? "review" : "review"
    });
  }

  for (const groupName of [...new Set(rows.map((row) => row.group))]) {
    const teamIds = teams
      .filter((team) => team.group?.name === groupName)
      .map((team) => team.id);
    rasterSizeForGroupSize(teamIds.length);
    const league = rows.find((row) => row.group === groupName)?.league ?? "click-TT";
    groups.push({
      ref: { league, name: groupName },
      size: teamIds.length,
      teamIds
    });
  }

  return {
    clubs: [...clubs.values()],
    teams,
    groups,
    wishes: [...clubs.values()].flatMap((club) =>
      extractRelationalWishes(club.id, club.notes, teams)
    ),
    absoluteConstraints: [],
    warnings: [
      "click-TT groups/Rasterzahlen scraped by navigation; Terminwünsche PDFs parsed best-effort for weekdays and wishes."
    ]
  };
}
