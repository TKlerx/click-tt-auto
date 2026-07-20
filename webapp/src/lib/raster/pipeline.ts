import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { TeamRasterAssignmentRow } from "../../../../src/raster/ingest/clicktt-assignments.js";
import type { ParsedUpperLeagueImport } from "../../../../src/raster/ingest/groups-pdf.js";
import type { RosterCsvParseResult } from "../../../../src/raster/ingest/roster-csv.js";
import type { WishParseResult } from "../../../../src/raster/ingest/wishes-pdf.js";
import type { Assignment, SeasonModel } from "../../../../src/raster/types.js";

const execFileAsync = promisify(execFile);
const repoRoot = process.env.RASTER_REPO_ROOT ?? `${process.cwd()}/..`;
const ingestIndexUrl = pathToFileURL(
  `${repoRoot}/src/raster/ingest/index.ts`,
).href;
const ingestScrapeUrl = pathToFileURL(
  `${repoRoot}/src/raster/ingest/scrape.ts`,
).href;
const ingestWishesPdfUrl = pathToFileURL(
  `${repoRoot}/src/raster/ingest/wishes-pdf.ts`,
).href;
const ingestRosterCsvUrl = pathToFileURL(
  `${repoRoot}/src/raster/ingest/roster-csv.ts`,
).href;
const scoreEvaluateUrl = pathToFileURL(
  `${repoRoot}/src/raster/score/evaluate.ts`,
).href;
const rulebookUrl = pathToFileURL(
  `${repoRoot}/src/raster/rulebook/rulebook.ts`,
).href;
const typesUrl = pathToFileURL(`${repoRoot}/src/raster/types.ts`).href;

type RasterAssignmentScore = {
  assignment: Assignment;
  objective: number;
  hardViolations: Array<{ detail: string }>;
  overUsages: Array<{
    clubId: string;
    hall: string;
    weekday: string;
    week: number;
    teams: string[];
    capacity: number;
    excess: number;
  }>;
  objectiveBreakdown: Record<string, number>;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
}

async function parseWishesPdf(filePath: string): Promise<WishParseResult> {
  return runRasterTs<WishParseResult>(`
    const { parseWishesPdf } = await import(${JSON.stringify(ingestWishesPdfUrl)});
    emit(await parseWishesPdf(${JSON.stringify(filePath)}));
  `);
}

async function parseRosterCsvBytes(
  bytes: Buffer,
): Promise<RosterCsvParseResult> {
  return runRasterTs<RosterCsvParseResult>(`
    const { parseRosterCsvBytes } = await import(${JSON.stringify(ingestRosterCsvUrl)});
    emit(parseRosterCsvBytes(Uint8Array.from(${JSON.stringify([...bytes])})));
  `);
}

async function readAssignmentTable(
  filePath: string,
): Promise<TeamRasterAssignmentRow[]> {
  return runRasterTs<TeamRasterAssignmentRow[]>(`
    const { readAssignmentTable } = await import(${JSON.stringify(ingestIndexUrl)});
    emit(await readAssignmentTable(${JSON.stringify(filePath)}));
  `);
}

async function parseUpperLeagueRasterPdf(
  filePath: string,
): Promise<ParsedUpperLeagueImport> {
  return runRasterTs<ParsedUpperLeagueImport>(`
    const { parseUpperLeagueRasterPdf } = await import(${JSON.stringify(ingestIndexUrl)});
    emit(await parseUpperLeagueRasterPdf(${JSON.stringify(filePath)}));
  `);
}

async function buildSeasonModelFromAssignments(
  assignments: TeamRasterAssignmentRow[],
): Promise<SeasonModel> {
  return runRasterTs<SeasonModel>(`
    const { buildSeasonModelFromAssignments } = await import(${JSON.stringify(ingestIndexUrl)});
    emit(await buildSeasonModelFromAssignments(${JSON.stringify(assignments)}));
  `);
}

async function scrapeClickTtAssignments(options?: {
  groupNamePattern?: string;
}): Promise<TeamRasterAssignmentRow[]> {
  return runRasterTs<TeamRasterAssignmentRow[]>(`
    const { scrapeCurrentTeamRasterAssignments } = await import(${JSON.stringify(ingestScrapeUrl)});
    emit(await scrapeCurrentTeamRasterAssignments(${JSON.stringify(options)}));
  `);
}

async function scrapeClickTtPublicLeagueAssignments(
  leaguePageUrl: string,
): Promise<TeamRasterAssignmentRow[]> {
  return runRasterTs<TeamRasterAssignmentRow[]>(`
    const { scrapePublicLeagueAssignmentsFromUrl } = await import(${JSON.stringify(ingestScrapeUrl)});
    emit(await scrapePublicLeagueAssignmentsFromUrl(${JSON.stringify(leaguePageUrl)}));
  `);
}

async function scoreAssignment(
  model: SeasonModel,
  assignment: Assignment,
): Promise<RasterAssignmentScore> {
  return runRasterTs<RasterAssignmentScore>(`
    const { evaluate, overUsageFairnessCost } = await import(${JSON.stringify(scoreEvaluateUrl)});
    const { derbySpieltag, rasterSizeForGroupSize } = await import(${JSON.stringify(rulebookUrl)});
    const { defaultWeights } = await import(${JSON.stringify(typesUrl)});
    const model = ${JSON.stringify(model)};
    const assignment = ${JSON.stringify(assignment)};
    const result = evaluate(model, assignment, defaultWeights);
    let sameClubDerbySt4 = 0;
    for (const group of model.groups) {
      const rasterSize = rasterSizeForGroupSize(group.size, group.rasterMode);
      for (const [leftIndex, leftId] of group.teamIds.entries()) {
        const left = model.teams.find((team) => team.id === leftId);
        const leftRz = result.assignment[leftId];
        if (!left || leftRz === undefined) continue;
        for (const rightId of group.teamIds.slice(leftIndex + 1)) {
          const right = model.teams.find((team) => team.id === rightId);
          const rightRz = result.assignment[rightId];
          if (!right || rightRz === undefined || left.clubId !== right.clubId) continue;
          if (derbySpieltag(rasterSize, leftRz, rightRz) === 4) sameClubDerbySt4 += 1;
        }
      }
    }
    const brokenWechsel = result.wishResults.filter(
      (entry) => entry.status === "unfulfilled" && entry.wish.relation === "wechsel"
    ).length;
    const brokenZeitgleich = result.wishResults.filter(
      (entry) => entry.status === "unfulfilled" && entry.wish.relation === "zeitgleich"
    ).length;
    emit({
      assignment: result.assignment,
      objective: result.objective,
      hardViolations: result.hardViolations,
      overUsages: result.overUsages,
      objectiveBreakdown: {
        overUsage: result.overUsages.reduce((sum, usage) => sum + usage.excess ** 2, 0) * defaultWeights.overUsage,
        overUsageFairness: overUsageFairnessCost(result.overUsages) * defaultWeights.overUsageFairness,
        wechsel: brokenWechsel * defaultWeights.wechsel,
        zeitgleich: brokenZeitgleich * defaultWeights.zeitgleich,
        sameClubDerbySt4: sameClubDerbySt4 * defaultWeights.sameClubDerbySt4,
        spielwoche: result.spielwocheMisses.length * defaultWeights.spielwoche,
      },
    });
  `);
}

async function runRasterTs<T>(code: string): Promise<T> {
  const command =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const dir = await mkdtemp(path.join(tmpdir(), "raster-ts-"));
  const scriptPath = `${dir}/run.ts`;
  await writeFile(
    scriptPath,
    `
    function emit(value) {
      process.stdout.write("__RASTER_JSON__" + JSON.stringify(value) + "\\n");
    }
    async function main() {
      ${code}
    }
    main().catch((error) => {
      process.stderr.write(String(error) + "\\n");
      process.exit(1);
    });
  `,
  );
  try {
    const { stdout, stderr } = await execFileAsync(
      command,
      process.platform === "win32"
        ? ["/d", "/c", `pnpm exec tsx ${scriptPath}`]
        : ["exec", "tsx", scriptPath],
      {
        cwd: repoRoot,
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const lines = stdout.split(/\r?\n/);
    let line: string | undefined;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index]?.startsWith("__RASTER_JSON__")) {
        line = lines[index];
        break;
      }
    }
    if (!line) {
      throw new Error(stderr.trim() || "Raster parser returned no data");
    }
    return JSON.parse(line.slice("__RASTER_JSON__".length)) as T;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const rasterIngest = {
  parseCsvLine,
  parseRosterCsvBytes,
  parseWishesPdf,
  parseUpperLeagueRasterPdf,
  readAssignmentTable,
  buildSeasonModelFromAssignments,
  scrapeClickTtAssignments,
  scrapeClickTtPublicLeagueAssignments,
  scoreAssignment,
};
