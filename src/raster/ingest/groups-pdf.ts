import { extractPdfText } from "./pdf-text.js";
import type { Group, Team } from "../types.js";

export const UPPER_LEAGUE_RASTER_SOURCE_TYPE = "UPPER_LEAGUE_RASTER";

export interface ParsedUpperLeagueImport {
  sourceLabel: string;
  leagues: ParsedUpperLeague[];
}

export interface ParsedUpperLeague {
  league: string;
  size: number;
  entries: ParsedUpperLeagueEntry[];
}

export interface ParsedUpperLeagueEntry {
  rasterzahl: number;
  team: string;
  homeWeekday?: string;
  startTime?: string;
}

export interface GroupParseResult {
  groups: Group[];
  fixed: Map<string, number>;
  warnings: string[];
}

type LeagueBlock = { league: string; start: number; end: number };

const leagueHeading =
  /\b((?:Regionalliga|Oberliga|NRW-Liga(?:\s+\d+)?|Verbandsliga\s+\d+|Landesliga\s+\d+)\s+(?:Erwachsene|Damen|Jugend|Mädchen))\b/g;
const entryStart = /(?:^|\s{2,})(\d{1,2})(?=\s{2,})/g;
const dayAndTime =
  /\b(Mo|Di|Mi|Do|Fr|Sa|So)(?:\.\/(?:Mo|Di|Mi|Do|Fr|Sa|So)\.)?\.?\s+(\d{1,2})[.:](\d{2})\s*Uhr/i;
const weekdayByShort: Record<string, string> = {
  Mo: "monday",
  Di: "tuesday",
  Mi: "wednesday",
  Do: "thursday",
  Fr: "friday",
  Sa: "saturday",
  So: "sunday"
};

export async function parseUpperLeagueRasterPdf(
  filePath: string
): Promise<ParsedUpperLeagueImport> {
  const text = await extractPdfText(filePath);
  const leagues = parseUpperLeagueRasterText(text);
  if (!leagues.some((league) => league.entries.length)) {
    throw new Error(`${filePath}: no readable upper-league raster entries found`);
  }
  return {
    sourceLabel: filePath.split(/[\\/]/).pop() ?? filePath,
    leagues
  };
}

export function parseUpperLeagueRasterText(text: string): ParsedUpperLeague[] {
  return leagueBlocks(text)
    .map((block) => {
      const parsed = parseLeagueSection(text.slice(block.start, block.end));
      return {
        league: block.league,
        size: parsed.size,
        entries: parsed.entries
      };
    })
    .filter((league) => league.entries.length);
}

export async function parseGroupsPdf(
  filePath: string,
  teams: Team[]
): Promise<GroupParseResult> {
  const upperLeagueImport = await parseUpperLeagueRasterPdf(filePath);
  const allEntries = upperLeagueImport.leagues.flatMap((league) =>
    league.entries.map((entry) => ({ ...entry, league: league.league }))
  );
  const usedByTeam = new Map<string, number>();
  const fixed = new Map<string, number>();
  for (const team of teams) {
    const teamLabel = team.label.toLowerCase();
    const groupLabel = team.group
      ? [team.group.league, team.group.name].filter(Boolean).join(" ").toLowerCase()
      : "";
    const candidates = allEntries.filter(
      (entry) => entry.team.toLowerCase() === teamLabel
    );
    const exact = groupLabel
      ? candidates.find((entry) => entry.league.toLowerCase() === groupLabel)
      : candidates[usedByTeam.get(teamLabel) ?? 0];
    if (exact) fixed.set(team.id, exact.rasterzahl);
    usedByTeam.set(teamLabel, (usedByTeam.get(teamLabel) ?? 0) + 1);
  }

  const groupSizes = splitIntoSupportedGroupSizes(teams.length);
  let offset = 0;
  const groups: Group[] = groupSizes.map((size, index) => {
    const teamIds = teams.slice(offset, offset + size).map((team) => team.id);
    offset += size;
    return {
      ref: {
        league: upperLeagueImport.leagues[index]?.league ?? "Unknown",
        name: upperLeagueImport.leagues[index]?.league ?? `Review Group ${index + 1}`
      },
      size: teamIds.length,
      teamIds
    };
  });

  return { groups, fixed, warnings: [] };
}

export function splitIntoSupportedGroupSizes(total: number): number[] {
  if (total <= 12) return [total];

  const minGroups = Math.ceil(total / 12);
  const maxGroups = Math.floor(total / 6);
  const preferred = Math.round(total / 10);
  const candidates = Array.from(
    { length: maxGroups - minGroups + 1 },
    (_, index) => minGroups + index
  ).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));

  for (const count of candidates) {
    const base = Math.floor(total / count);
    const extra = total % count;
    if (base >= 6 && base + (extra > 0 ? 1 : 0) <= 12) {
      return Array.from({ length: count }, (_, index) =>
        index < extra ? base + 1 : base
      );
    }
  }

  return Array.from({ length: Math.ceil(total / 10) }, (_, index) =>
    Math.min(10, total - index * 10)
  ).filter((size) => size > 0);
}

function leagueBlocks(text: string): LeagueBlock[] {
  const matches = [...text.matchAll(leagueHeading)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    return {
      league: normalizeSpace(match[1] ?? match[0]),
      start,
      end: next?.index ?? text.length
    };
  });
}

function parseLeagueSection(section: string): {
  size: number;
  entries: ParsedUpperLeagueEntry[];
} {
  const starts = [...section.matchAll(entryStart)].map((match) => ({
    number: Number(match[1]),
    contentStart: (match.index ?? 0) + match[0].length,
    start: match.index ?? 0
  }));
  const entries: ParsedUpperLeagueEntry[] = [];
  for (const [index, start] of starts.entries()) {
    const raw = normalizeSpace(
      section.slice(start.contentStart, starts[index + 1]?.start ?? section.length)
    );
    if (!raw || /^xxx\b/i.test(raw)) continue;
    const time = raw.match(dayAndTime);
    const team = normalizeSpace(raw.slice(0, time?.index ?? raw.length));
    if (!team) continue;
    entries.push({
      rasterzahl: start.number,
      team,
      ...(time
        ? {
            homeWeekday: weekdayByShort[time[1]!] ?? time[1]!.toLowerCase(),
            startTime: `${time[2]!.padStart(2, "0")}.${time[3]!}`
          }
        : {})
    });
  }
  return {
    size: Math.max(0, ...starts.map((start) => start.number)),
    entries
  };
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
