import fs from "node:fs/promises";
import type { Assignment, EvaluationResult, SeasonModel, Weekday } from "../types.js";
import type { TeamRasterAssignmentRow } from "./clicktt-assignments.js";

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

export async function readAssignmentTable(
  filePath: string
): Promise<TeamRasterAssignmentRow[]> {
  if (/\.json$/i.test(filePath)) {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as TeamRasterAssignmentRow[];
  }

  const [headerLine, ...lines] = (await fs.readFile(filePath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      ...(row.league ? { league: row.league } : {}),
      ...(row.division ? { division: row.division } : {}),
      group: row.group ?? "",
      rasterzahl: Number(row.rasterzahl),
      team: row.team ?? "",
      sourceUrl: row.sourceUrl ?? "",
      ...(row.wishUrl ? { wishUrl: row.wishUrl } : {})
    };
  });
}

interface CapacityRow {
  club: string;
  hall?: string;
  weekday?: Weekday;
  capacity: number;
}

function parseWeekday(value: string): Weekday | undefined {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, Weekday> = {
    monday: "monday",
    montag: "monday",
    tuesday: "tuesday",
    dienstag: "tuesday",
    wednesday: "wednesday",
    mittwoch: "wednesday",
    thursday: "thursday",
    donnerstag: "thursday",
    friday: "friday",
    freitag: "friday",
    saturday: "saturday",
    samstag: "saturday",
    sunday: "sunday",
    sonntag: "sunday"
  };
  return map[normalized];
}

export async function readCapacityTable(filePath: string): Promise<CapacityRow[]> {
  const [headerLine, ...lines] = (await fs.readFile(filePath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine);
  return lines.flatMap((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const capacity = Number(row.capacity);
    if (!row.club || !Number.isFinite(capacity)) return [];
    const weekday = row.weekday ? parseWeekday(row.weekday) : undefined;
    if (row.weekday && !weekday) return [];
    return [
      {
        club: row.club,
        ...(row.hall ? { hall: row.hall } : {}),
        ...(weekday ? { weekday } : {}),
        capacity
      }
    ];
  });
}

export function applyCapacityRows(model: SeasonModel, rows: CapacityRow[]): void {
  for (const row of rows) {
    const club = model.clubs.find((candidate) => candidate.name.toLowerCase() === row.club.toLowerCase());
    if (!club) continue;
    const venues = row.hall ? club.venues.filter((venue) => venue.hall === row.hall) : club.venues;
    for (const venue of venues.length > 0 ? venues : [{ hall: row.hall ?? "1", name: row.hall ?? "1" }]) {
      if (!club.venues.includes(venue)) club.venues.push(venue);
      if (row.weekday) {
        venue.capacityByWeekday = { ...venue.capacityByWeekday, [row.weekday]: row.capacity };
      } else {
        venue.capacity = row.capacity;
      }
    }
  }
}

function key(group: string, team: string): string {
  return `${group.toLowerCase()}|${team.toLowerCase()}`;
}

export function assignmentFromRows(
  model: SeasonModel,
  rows: TeamRasterAssignmentRow[]
): Assignment {
  const byTeam = new Map(
    model.teams.map((team) => [key(team.group?.name ?? "", team.name ?? team.label), team.id])
  );
  return Object.fromEntries(
    rows.flatMap((row) => {
      const teamId = byTeam.get(key(row.group, row.team));
      return teamId ? [[teamId, row.rasterzahl] as const] : [];
    })
  );
}

export function assignmentRowsFromModel(
  model: SeasonModel,
  assignment: Assignment
): TeamRasterAssignmentRow[] {
  return model.groups.flatMap((group) =>
    group.teamIds.map((teamId) => {
      const team = model.teams.find((candidate) => candidate.id === teamId);
      return {
        group: group.ref.name,
        rasterzahl: assignment[teamId] ?? 0,
        team: team?.name ?? team?.label ?? teamId,
        sourceUrl: ""
      };
    })
  );
}

export function assignmentRowsToCsv(rows: TeamRasterAssignmentRow[]): string {
  const quote = (value: string | number | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return (
    [
      "league,group,division,rasterzahl,team,sourceUrl,wishUrl",
      ...rows.map((row) =>
        [row.league, row.group, row.division, row.rasterzahl, row.team, row.sourceUrl, row.wishUrl].map(quote).join(",")
      )
    ].join("\n") + "\n"
  );
}

function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function reviewRowsToCsv(
  model: SeasonModel
): string {
  return (
    [
      "league,group,club,team,teamLabel,weekday,weekSlot,hall,startTime",
      ...model.groups.flatMap((group) =>
        group.teamIds.map((teamId) => {
          const team = model.teams.find((candidate) => candidate.id === teamId);
          const club = model.clubs.find((candidate) => candidate.id === team?.clubId);
          return [
            group.ref.league,
            group.ref.name,
            club?.name,
            team?.name,
            team?.label,
            team?.homeWeekday,
            team?.spielwochePref,
            team?.hall,
            team?.startTime
          ]
            .map(csvCell)
            .join(",");
        })
      )
    ].join("\n") + "\n"
  );
}

export function unmetWishesToCsv(
  model: SeasonModel,
  result: EvaluationResult
): string {
  const teamName = (teamId: string) => {
    const team = model.teams.find((candidate) => candidate.id === teamId);
    return team?.name ?? team?.label ?? teamId;
  };
  return (
    [
      "status,relation,club,teamA,teamB,reason",
      ...result.wishResults
        .filter((wish) => wish.status !== "fulfilled")
        .map((wish) => {
          const club = model.clubs.find((candidate) => candidate.id === wish.wish.clubId);
          return [
            wish.status,
            wish.wish.relation,
            club?.name,
            teamName(wish.wish.teamA),
            teamName(wish.wish.teamB),
            wish.reason
          ]
            .map(csvCell)
            .join(",");
        })
    ].join("\n") + "\n"
  );
}
