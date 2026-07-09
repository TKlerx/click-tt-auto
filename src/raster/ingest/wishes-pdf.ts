import path from "node:path";
import { extractPdfText } from "./pdf-text.js";
import { extractRequestedRasterzahlen } from "./wishes-freetext.js";
import type { Club, Team, WeekSlot, Weekday } from "../types.js";

const weekdays: Array<[RegExp, Weekday]> = [
  [/^(mo|montag)$/i, "monday"],
  [/^(di|dienstag)$/i, "tuesday"],
  [/^(mi|mittwoch)$/i, "wednesday"],
  [/^(do|donnerstag)$/i, "thursday"],
  [/^(fr|freitag)$/i, "friday"],
  [/^(sa|samstag)$/i, "saturday"],
  [/^(so|sonntag)$/i, "sunday"]
];

function parseWeekday(text: string): Weekday {
  return weekdays.find(([pattern]) => pattern.test(text))?.[1] ?? "friday";
}

function parseSlot(text: string): WeekSlot | undefined {
  if (/\bspielwoche\s*A\b|\bWoche\s*A\b/i.test(text)) return "A";
  if (/\bspielwoche\s*B\b|\bWoche\s*B\b/i.test(text)) return "B";
  return undefined;
}

export interface WishParseResult {
  clubs: Club[];
  teams: Team[];
  warnings: string[];
}

const teamLabelPattern =
  String.raw`(?:Erwachsene|Herren|Damen)(?:\s+[IVX]+)?|(?:Jugend|Jungen|Mädchen)\s*\d+(?:\s+[IVX]+)?`;
const weekdayPattern =
  String.raw`Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag`;

function clubId(value: string): string {
  return value.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function normalizeTeamLabel(value: string): string {
  return value.replace(/^Herren/i, "Erwachsene").trim();
}

function splitClubSections(text: string): string[] {
  const starts = [
    ...text.matchAll(/Westdeutscher Tischtennis-Verband e\.V\./g)
  ].map((match) => match.index ?? 0);
  if (starts.length <= 1) return [text];
  return starts.map((start, index) => text.slice(start, starts[index + 1]));
}

export function parseWishesText(filePath: string, text: string): WishParseResult {
  const stem = path.basename(filePath, path.extname(filePath));
  const clubs: Club[] = [];
  const teams: Team[] = [];

  for (const section of splitClubSections(text)) {
    const clubMatch = section.match(/Terminwünsche\s+(.+?)\s+\((\d+)\)\s+Kontaktperson/i);
    const name = clubMatch?.[1]?.trim() ?? stem;
    const id = clubId(clubMatch ? `${name}-${clubMatch[2]}` : stem);
    const hallMatches = [
      ...section.matchAll(/Spiellokal\s*(\d)\s*:?\s*([^;\n]{3,120}?)(?=\s+Spiellokal\s*\d|\s+Terminwünsche\s+Mannschaft|\s*$)/gi)
    ];
    const venues = (
      hallMatches.length > 0
        ? hallMatches
        : [["", "1", "Halle 1"] as unknown as RegExpMatchArray]
    ).map((match) => ({
      hall: match[1]!,
      name: match[2]!.trim()
    }));
    const notes =
      section.match(/Besondere\s+Wünsche(?:\s+und\s+Hinweise)?\s*:?\s*([\s\S]{0,1000})/i)?.[1]?.trim() ??
      "";
    const teamRows = [
      ...section.matchAll(
        new RegExp(
          `(${teamLabelPattern})\\s+(${weekdayPattern})\\s*(\\d{1,2}:\\d{2}),\\s*Halle\\s*([123])([\\s\\S]*?)(?=\\s+(?:${teamLabelPattern})\\s+(?:${weekdayPattern})\\s*\\d|\\s+Besondere Wünsche|\\s+nu \\.Dokument|$)`,
          "gi"
        )
      )
    ];
    if (!clubMatch && teamRows.length === 0) continue;
    const rows =
      teamRows.length > 0
        ? teamRows
        : [
            [
              "",
              "Erwachsene",
              "Fr",
              "19:30",
              "1",
              ""
            ] as unknown as RegExpMatchArray
          ];
    clubs.push({ id, name, venues, notes });
    rows.forEach((match, index) => {
      const label = normalizeTeamLabel(match[1]!);
      const requestedRasterzahl = extractRequestedRasterzahlen(notes);
      const spielwochePref = parseSlot(match[5] ?? "");
      teams.push({
        id: `${id}-${index + 1}`,
        clubId: id,
        label,
        homeWeekday: parseWeekday(match[2] ?? ""),
        hall: match[4] ?? "1",
        ...(match[3] ? { startTime: match[3] } : {}),
        ...(spielwochePref ? { spielwochePref } : {}),
        rasterzahl: { kind: "assignable" },
        ...(requestedRasterzahl.length > 0 ? { requestedRasterzahl } : {}),
        confidence: "review"
      });
    });
  }

  return {
    clubs,
    teams,
    warnings: [
      `${filePath}: PDF wishes parsed best-effort; review extracted teams and free-text wishes.`
    ]
  };
}

export async function parseWishesPdf(
  filePath: string
): Promise<WishParseResult> {
  const text = await extractPdfText(filePath);
  return parseWishesText(filePath, text);
}
