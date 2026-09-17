import fs from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "../raster/ingest/pdf-text.js";

const DAY = "(?:Mo|Di|Mi|Do|Fr|Sa|So)\\.";
const NUSCORE_URL = "https://ttde-apps.liga.nu/nuliga/nuscore-tt2";
const BLOCK_START = "[nuScore]";
const BLOCK_END = "[/nuScore]";

export type GameCodeEntry = {
  date: string;
  start: Date;
  team: string;
  homeTeam: string;
  guestTeam: string;
  opponent: string;
  home: boolean;
  pin: string;
  gameCode?: string;
  url?: string;
};

type PdfRow = Omit<GameCodeEntry, "pin"> & { value: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseDate(day: string, month: string, year: string, hour: string, minute: string): Date {
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

function formatDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function splitRows(text: string): string[] {
  const matches = [...text.matchAll(new RegExp(`\\b${DAY}\\s+\\d{2}\\.\\d{2}\\.\\d{4}`, "g"))];
  return matches.map((match, index) => text.slice(match.index, matches[index + 1]?.index).trim());
}

function splitTeams(teams: string, clubName: string): { team: string; homeTeam: string; guestTeam: string } | null {
  const club = new RegExp(`${escapeRegExp(clubName)}(?:\\s+[IVXLCDM]+\\b)?`, "i");
  const match = club.exec(teams);
  if (!match) return null;

  const team = normalize(match[0]);
  if (match.index === 0) {
    return { team, homeTeam: team, guestTeam: normalize(teams.slice(match[0].length)) };
  }

  return { team, homeTeam: normalize(teams.slice(0, match.index)), guestTeam: team };
}

function parsePdfRows(text: string, clubName: string): PdfRow[] {
  return splitRows(normalize(text))
    .map((row): PdfRow | null => {
      const match = row.match(
        new RegExp(`^${DAY}\\s+(\\d{2})\\.(\\d{2})\\.(\\d{4})\\s+(\\d{2}):(\\d{2})\\s+(?:\\(?\\d+\\)?\\s+(?:v\\s+)?)?(.+?)\\s+([A-Z0-9]{12}|\\d{4})(?:\\s|$)`)
      );
      if (!match) return null;

      const [, day, month, year, hour, minute, teamsText, value] = match;
      const start = parseDate(day!, month!, year!, hour!, minute!);
      const teams = splitTeams(teamsText!, clubName);
      if (!teams) return null;

      const home = teams.homeTeam === teams.team;
      return {
        date: formatDateKey(start),
        start,
        ...teams,
        opponent: home ? teams.guestTeam : teams.homeTeam,
        home,
        value: value!,
        ...(value!.length === 12 ? { url: NUSCORE_URL } : {}),
      };
    })
    .filter((row): row is PdfRow => row !== null);
}

function key(row: Pick<GameCodeEntry, "date" | "homeTeam" | "guestTeam">): string {
  return `${row.date}|${normalize(row.homeTeam).toLowerCase()}|${normalize(row.guestTeam).toLowerCase()}`;
}

export async function parseGameCodeDirectory(dir: string, clubName = "TTC Paderborn"): Promise<GameCodeEntry[]> {
  const files = (await fs.readdir(dir)).filter((file) => file.toLowerCase().endsWith(".pdf"));
  const pins = new Map<string, GameCodeEntry>();

  for (const file of files) {
    const text = await extractPdfText(path.join(dir, file));
    const rows = parsePdfRows(text, clubName);
    for (const row of rows) {
      if (/^\d{4}$/.test(row.value)) {
        const { value, ...entry } = row;
        pins.set(key(row), { ...entry, pin: value });
      }
    }
  }

  for (const file of files) {
    const text = await extractPdfText(path.join(dir, file));
    const rows = parsePdfRows(text, clubName);
    for (const row of rows) {
      if (!/^[A-Z0-9]{12}$/.test(row.value)) continue;

      const entry = pins.get(key(row));
      if (entry) {
        entry.gameCode = row.value;
        if (row.url) entry.url = row.url;
      }
    }
  }

  return [...pins.values()].sort((a, b) => a.start.getTime() - b.start.getTime() || a.team.localeCompare(b.team));
}

export function formatSpondCodeBlock(entry: GameCodeEntry): string {
  const lines = [BLOCK_START, `PIN: ${entry.pin}`];
  if (entry.home && entry.gameCode) {
    lines.push(`nuScore: ${entry.url ?? NUSCORE_URL}`, `Spiel-Code: ${entry.gameCode}`);
  }
  lines.push(BLOCK_END);
  return lines.join("\n");
}

export function upsertSpondCodeBlock(description: string | undefined, entry: GameCodeEntry): string {
  const block = formatSpondCodeBlock(entry);
  const current = description?.trim() ?? "";
  const pattern = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}`, "m");
  return pattern.test(current) ? current.replace(pattern, block) : [current, block].filter(Boolean).join("\n\n");
}
