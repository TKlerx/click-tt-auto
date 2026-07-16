import fs from "node:fs/promises";
import minimist from "minimist";
import {
  applyCapacityRows,
  assignmentFromRows,
  assignmentRowsFromModel,
  assignmentRowsToCsv,
  buildSeasonModel,
  readCapacityTable,
  readAssignmentTable,
  reviewRowsToCsv,
  scrapeSeasonModel,
  unmetWishesToCsv
} from "./raster/ingest/index.js";
import { optimize, startingAssignment } from "./raster/optimize/index.js";
import {
  formatEvaluationSummary,
  formatModelSummary,
  writeJson
} from "./raster/report/index.js";
import { evaluate } from "./raster/score/index.js";
import {
  defaultWeights,
  type Assignment,
  type SeasonModel,
  type Weights
} from "./raster/types.js";

function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function readWeights(filePath?: string): Promise<Weights> {
  return filePath
    ? { ...defaultWeights, ...(await readJson<Partial<Weights>>(filePath)) }
    : defaultWeights;
}

function applyPins(model: SeasonModel, pins: string[]): void {
  for (const pin of pins) {
    const [teamId, rawValue] = pin.split("=");
    const team = model.teams.find((candidate) => candidate.id === teamId);
    if (!team || !rawValue)
      throw new Error(`Bad --pin ${pin}; expected teamId=rasterzahl`);
    team.rasterzahl = { kind: "pinned", value: Number(rawValue) };
  }
}

async function ingest(argv: minimist.ParsedArgs): Promise<void> {
  const out = String(argv.out ?? "reports/raster/model.json");
  const wishPaths = [...values(argv.wishes), ...values(argv._)];
  const fixedRows =
    typeof argv.fixed === "string" ? await readAssignmentTable(argv.fixed) : [];
  const model = argv["from-clicktt"]
    ? await scrapeSeasonModel(
        fixedRows,
        typeof argv["public-league"] === "string"
          ? argv["public-league"]
          : undefined,
        rosterExportOptions(argv)
      )
    : await buildSeasonModel(wishPaths, String(argv.groups ?? ""));
  if (typeof argv.capacity === "string") {
    applyCapacityRows(model, await readCapacityTable(argv.capacity));
  }
  await writeJson(out, model);
  if (typeof argv.current === "string" && argv["from-clicktt"]) {
    const currentRows = await readAssignmentTable(
      "reports/raster/team-raster-assignment.json"
    ).catch(() => []);
    const current = assignmentFromRows(model, currentRows);
    await writeJson(argv.current, current);
    const review = String(argv.review ?? "reports/raster/review-input.csv");
    await fs.writeFile(review, reviewRowsToCsv(model), "utf8");
    console.log(`wrote ${review}`);
  }
  console.log(formatModelSummary(model));
  console.log(`wrote ${out}`);
  if (typeof argv.current === "string") console.log(`wrote ${argv.current}`);
}

async function score(argv: minimist.ParsedArgs): Promise<void> {
  const model = await readJson<SeasonModel>(
    String(argv.model ?? "reports/raster/model.json")
  );
  const assignment = await readJson<Assignment>(String(argv.assignment));
  const result = evaluate(
    model,
    assignment,
    await readWeights(
      typeof argv.weights === "string" ? argv.weights : undefined
    )
  );
  const report = String(
    argv.report ?? `reports/raster/score-${Date.now()}.json`
  );
  await writeJson(report, result);
  if (typeof argv.unmet === "string") {
    await fs.writeFile(argv.unmet, unmetWishesToCsv(model, result), "utf8");
  }
  console.log(formatEvaluationSummary(result));
  console.log(`wrote ${report}`);
  if (typeof argv.unmet === "string") console.log(`wrote ${argv.unmet}`);
}

async function runOptimize(argv: minimist.ParsedArgs): Promise<void> {
  const model = await readJson<SeasonModel>(
    String(argv.model ?? "reports/raster/model.json")
  );
  applyPins(model, values(argv.pin));
  const weights = await readWeights(
    typeof argv.weights === "string" ? argv.weights : undefined
  );
  const start =
    typeof argv.start === "string"
      ? await readJson<Assignment>(argv.start)
      : startingAssignment(model);
  const assignment = optimize(model, start, weights);
  const result = evaluate(model, assignment, weights);
  const out = String(
    argv.out ?? `reports/raster/assignment-${Date.now()}.json`
  );
  const report = String(
    argv.report ?? `reports/raster/proposal-${Date.now()}.json`
  );
  await writeJson(out, assignment);
  await writeJson(report, result);
  if (typeof argv.csv === "string") {
    await fs.mkdir("reports/raster", { recursive: true });
    await fs.writeFile(
      argv.csv,
      assignmentRowsToCsv(assignmentRowsFromModel(model, assignment)),
      "utf8"
    );
  }
  const unmet = String(argv.unmet ?? "reports/raster/unmet-wishes.csv");
  await fs.writeFile(unmet, unmetWishesToCsv(model, result), "utf8");
  console.log(formatEvaluationSummary(result));
  console.log(`wrote ${out}`);
  console.log(`wrote ${report}`);
  if (typeof argv.csv === "string") console.log(`wrote ${argv.csv}`);
  console.log(`wrote ${unmet}`);
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const [command, ...rest] = args;
  const argv = minimist(rest, {
    boolean: ["from-clicktt"],
    string: [
      "wishes",
      "groups",
      "out",
      "model",
      "assignment",
      "weights",
      "report",
      "start",
      "pin",
      "fixed",
      "current",
      "csv",
      "review",
      "unmet",
      "capacity",
      "public-league",
      "roster-meisterschaft",
      "roster-region",
      "roster-season",
      "roster-charset"
    ]
  });
  if (command === "ingest") return ingest(argv);
  if (command === "score") return score(argv);
  if (command === "optimize") return runOptimize(argv);
  throw new Error("Usage: pnpm run raster -- <ingest|score|optimize> [flags]");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = /Usage:|Bad --pin/.test(
    error instanceof Error ? error.message : String(error)
  )
    ? 2
    : 1;
});

function rosterExportOptions(argv: minimist.ParsedArgs) {
  const meisterschaft = stringArg(argv["roster-meisterschaft"]);
  if (!meisterschaft) return undefined;
  const region = stringArg(argv["roster-region"]);
  const season = stringArg(argv["roster-season"]);
  if (!region || !season) {
    throw new Error(
      "--roster-meisterschaft requires --roster-region and --roster-season"
    );
  }
  return {
    meisterschaft,
    region,
    season,
    charset:
      stringArg(argv["roster-charset"]) === "ISO-8859-15"
        ? ("ISO-8859-15" as const)
        : ("UTF-8" as const)
  };
}

function stringArg(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
