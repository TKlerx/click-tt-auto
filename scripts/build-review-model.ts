import fs from "node:fs/promises";
import path from "node:path";
import { parseCsvLine, reviewRowsToCsv } from "../src/raster/ingest/index.ts";
import { rasterSizeForGroupSize } from "../src/raster/rulebook/index.ts";
import { writeJson } from "../src/raster/report/index.ts";
import type { Club, SeasonModel, Team, Weekday, WeekSlot } from "../src/raster/types.ts";

interface ReviewRow {
  matchStatus: string;
  club: string;
  division: string;
  teamLabel: string;
  weekday: string;
  weekSlot: string;
  hall: string;
  startTime: string;
  league: string;
  group: string;
  rank: string;
  rasterzahl: string;
  publicTeam: string;
  publicClub: string;
  sourcePdf: string;
  sourceUrl: string;
}

async function readCsv<T>(filePath: string): Promise<T[]> {
  const [headerLine, ...lines] = (await fs.readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as T;
  });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
}

function optionalWeekSlot(value: string): WeekSlot | undefined {
  return value === "A" || value === "B" ? value : undefined;
}

const [reviewPath = "reports/raster/public-admin-team-review.csv", out = "reports/raster/review-model.json"] =
  process.argv.slice(2);
const rows = (await readCsv<ReviewRow>(reviewPath)).filter((row) => row.group && row.publicTeam);
const byGroup = Map.groupBy(rows, (row) => row.group);
const clubs = new Map<string, Club>();
const teams: Team[] = [];
const groups: SeasonModel["groups"] = [];
const warnings: string[] = [];

for (const [groupName, groupRows] of byGroup) {
  try {
    rasterSizeForGroupSize(groupRows.length);
  } catch {
    warnings.push(`${groupName}: skipped unsupported group size ${groupRows.length}`);
    continue;
  }

  const teamIds: string[] = [];
  for (const row of groupRows) {
    const clubName = row.club || row.publicClub;
    const clubId = slug(row.publicClub || clubName);
    const teamId = `${slug(groupName)}-${slug(row.publicTeam)}`;
    clubs.set(clubId, {
      id: clubId,
      name: clubName,
      venues: [{ hall: row.hall || "1", name: row.hall || "1" }],
      notes: ""
    });
    teamIds.push(teamId);
    teams.push({
      id: teamId,
      clubId,
      name: row.publicTeam,
      label: row.teamLabel || row.division,
      group: { league: row.league || "public click-TT", name: groupName },
      homeWeekday: (row.weekday || "friday") as Weekday,
      hall: row.hall || "1",
      ...(row.startTime ? { startTime: row.startTime } : {}),
      ...(optionalWeekSlot(row.weekSlot) ? { spielwochePref: optionalWeekSlot(row.weekSlot) } : {}),
      rasterzahl: row.matchStatus === "matched-fixed-upper" ? { kind: "fixed", value: Number(row.rasterzahl) } : { kind: "assignable" },
      confidence: row.matchStatus === "missing-admin-pdf-team" ? "review" : "ok"
    });
  }
  groups.push({
    ref: { league: groupRows[0]?.league || "public click-TT", name: groupName },
    size: groupRows.length,
    teamIds
  });
}

const model: SeasonModel = {
  clubs: [...clubs.values()],
  teams,
  groups,
  wishes: [],
  absoluteConstraints: [],
  warnings
};

await fs.mkdir(path.dirname(out), { recursive: true });
await writeJson(out, model);
await fs.writeFile(out.replace(/\.json$/i, "-review.csv"), reviewRowsToCsv(model), "utf8");
console.log(`wrote ${out} (${teams.length} teams, ${groups.length} groups, ${warnings.length} warnings)`);
