import { readFile, writeFile } from "node:fs/promises";

import { optimize } from "../src/raster/optimize/search.js";
import {
  evaluate,
  overUsageFairnessCost,
} from "../src/raster/score/evaluate.js";
import { defaultWeights, type SeasonModel, type Weights } from "../src/raster/types.js";

type Args = Record<string, string | undefined>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function requireArg(args: Args, name: string): string {
  const value = args[name];
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function unwrapModel(value: unknown): SeasonModel {
  const row = value as { model?: unknown };
  return (row.model ?? value) as SeasonModel;
}

function mergeWeights(value: unknown): Weights {
  return { ...defaultWeights, ...((value as Partial<Weights> | null) ?? {}) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = unwrapModel(await readJson(requireArg(args, "model")));
  const weights = args.weights
    ? mergeWeights(await readJson(args.weights))
    : defaultWeights;
  const startedAt = performance.now();
  const assignment = optimize(model, undefined, weights);
  const result = evaluate(model, assignment, weights);
  const overUsage =
    result.overUsages.reduce((sum, usage) => sum + usage.excess ** 2, 0) *
    weights.overUsage;
  const overUsageFairness =
    overUsageFairnessCost(result.overUsages) * weights.overUsageFairness;
  const wechsel =
    result.wishResults.filter(
      (row) => row.status === "unfulfilled" && row.wish.relation === "wechsel",
    ).length * weights.wechsel;
  const zeitgleich =
    result.wishResults.filter(
      (row) =>
        row.status === "unfulfilled" && row.wish.relation === "zeitgleich",
    ).length * weights.zeitgleich;
  const spielwoche = result.spielwocheMisses.length * weights.spielwoche;
  const knownObjective =
    overUsage + overUsageFairness + wechsel + zeitgleich + spielwoche;
  const metadata = {
    solver: "initial-heuristic",
    status: result.hardViolations.length ? "FEASIBLE" : "OPTIMAL",
    objective: result.objective,
    bestBound: null,
    wallTimeSeconds: (performance.now() - startedAt) / 1000,
    weights,
    objectiveBreakdown: {
      overUsage,
      overUsageFairness,
      wechsel,
      zeitgleich,
      sameClubDerbySt4: Math.max(0, result.objective - knownObjective),
      spielwoche,
    },
  };
  await writeFile(requireArg(args, "out"), JSON.stringify(assignment, null, 2) + "\n");
  const metadataPath = args.metadata;
  if (metadataPath) {
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
  }
  console.log(JSON.stringify(metadata, null, 2));
}

void main();
