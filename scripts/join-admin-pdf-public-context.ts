import fs from "node:fs/promises";
import { parseCsvLine, readAssignmentTable } from "../src/raster/ingest/index.ts";

interface AdminRow {
  sourcePdf: string;
  club: string;
  division: string;
  teamLabel: string;
  weekday: string;
  weekSlot: string;
  hall: string;
  startTime: string;
}

interface PublicRow {
  league?: string;
  group: string;
  division?: string;
  rank?: string;
  rasterzahl?: string;
  team: string;
  sourceUrl: string;
}

function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function readCsv<T>(filePath: string): Promise<T[]> {
  const [headerLine, ...lines] = (await fs.readFile(filePath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as T;
  });
}

function normalize(value: string): string {
  return value
    .replace(/\btischtennisverein\b/gi, "ttv")
    .replace(/\bsportverein\b/gi, "sv")
    .replace(/rot[\s-]*weiß/gi, "rw")
    .replace(/blau[\s-]*weiß/gi, "bw")
    .replace(/\be\.?\s*v\.?\b/gi, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/[^a-z0-9äöüß]+/gi, " ")
    .trim()
    .toLowerCase();
}

function splitTeam(team: string): { club: string; suffix: string } {
  const match = team.match(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i);
  return {
    club: match ? team.slice(0, match.index).trim() : team.trim(),
    suffix: match?.[1]?.toUpperCase() === "I" ? "" : (match?.[1]?.toUpperCase() ?? "")
  };
}

function publicDivision(row: PublicRow): string {
  if (row.division) return row.division;
  if (/damen/i.test(row.group)) return "Damen";
  const youth = row.group.match(/(?:jugend|jungen|mädchen)\s*\d+/i)?.[0];
  return youth ? youth.replace(/^Jungen/i, "Jugend") : "Erwachsene";
}

function publicTeamLabel(row: PublicRow): string {
  const division = publicDivision(row);
  const suffix = splitTeam(row.team).suffix;
  return suffix ? `${division} ${suffix}` : division;
}

function key(club: string, division: string, teamLabel: string): string {
  return `${normalize(club)}|${normalize(division)}|${normalize(teamLabel)}`;
}

const [
  publicPath = "reports/raster/public-team-context.csv",
  adminPath = "reports/raster/admin-pdf-teams.csv",
  fixedPath
] =
  process.argv.slice(2);
const publicRows = await readCsv<PublicRow>(publicPath);
const adminRows = await readCsv<AdminRow>(adminPath);
const fixedRows = fixedPath ? await readAssignmentTable(fixedPath) : [];
const fixedByTeam = new Map(
  fixedRows.map((row) => {
    const team = splitTeam(row.team);
    const division = row.division ?? publicDivision({ group: row.group, team: row.team, sourceUrl: "" });
    const teamLabel = team.suffix ? `${division} ${team.suffix}` : division;
    return [key(team.club, division, teamLabel), row];
  })
);
const publicWithKeys = publicRows.map((row, index) => {
  const publicClub = splitTeam(row.team).club;
  const division = publicDivision(row);
  const teamLabel = publicTeamLabel(row);
  return { row, index, publicClub, division, teamLabel, key: key(publicClub, division, teamLabel) };
});
const publicByTeam = new Map<string, typeof publicWithKeys>();
for (const row of publicWithKeys) {
  publicByTeam.set(row.key, [...(publicByTeam.get(row.key) ?? []), row]);
}
const usedPublic = new Set<number>();
const adminJoined = adminRows.map((admin) => {
  const publicMatch = publicByTeam.get(key(admin.club, admin.division, admin.teamLabel))?.find((row) => !usedPublic.has(row.index));
  if (publicMatch) usedPublic.add(publicMatch.index);
  const fixedMatch = fixedByTeam.get(key(admin.club, admin.division, admin.teamLabel));
  return { admin, publicMatch, fixedMatch };
});
const publicOnly = publicWithKeys.filter((row) => !usedPublic.has(row.index));

await fs.mkdir("reports/raster", { recursive: true });
await fs.writeFile(
  "reports/raster/public-admin-team-review.csv",
  [
    "matchStatus,club,division,teamLabel,weekday,weekSlot,hall,startTime,league,group,rank,rasterzahl,publicTeam,publicClub,sourcePdf,sourceUrl",
    ...adminJoined.map(({ admin, publicMatch, fixedMatch }) =>
      [
        publicMatch ? "matched-public" : fixedMatch ? "matched-fixed-upper" : "missing-public-and-fixed",
        admin.club,
        admin.division,
        admin.teamLabel,
        admin.weekday,
        admin.weekSlot,
        admin.hall,
        admin.startTime,
        publicMatch?.row.league ?? fixedMatch?.league,
        publicMatch?.row.group ?? fixedMatch?.group,
        publicMatch?.row.rank ?? publicMatch?.row.rasterzahl,
        fixedMatch?.rasterzahl,
        publicMatch?.row.team,
        publicMatch?.publicClub,
        admin.sourcePdf,
        publicMatch?.row.sourceUrl
      ]
        .map(csvCell)
        .join(",")
    ),
    ...publicOnly.map(({ row, publicClub, division, teamLabel }) =>
      [
        "missing-admin-pdf-team",
        "",
        division,
        teamLabel,
        "",
        "",
        "",
        "",
        row.league,
        row.group,
        row.rank ?? row.rasterzahl,
        "",
        row.team,
        publicClub,
        "",
        row.sourceUrl
      ]
        .map(csvCell)
        .join(",")
    )
  ].join("\n") + "\n",
  "utf8"
);

console.log(
  `wrote reports/raster/public-admin-team-review.csv (${adminJoined.filter((row) => row.publicMatch || row.fixedMatch).length}/${adminJoined.length} admin teams covered, ${publicOnly.length} public-only rows)`
);
