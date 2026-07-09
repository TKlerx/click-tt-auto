import fs from "node:fs/promises";
import path from "node:path";
import type { EvaluationResult, SeasonModel } from "../types.js";

export async function writeJson(
  filePath: string,
  value: unknown
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function formatModelSummary(model: SeasonModel): string {
  const reviewTeams = model.teams.filter(
    (team) => team.confidence === "review"
  ).length;
  return [
    `clubs: ${model.clubs.length}`,
    `teams: ${model.teams.length}`,
    `groups: ${model.groups.length}`,
    `review fields: ${reviewTeams}`,
    ...model.warnings
  ].join("\n");
}

export function formatEvaluationSummary(result: EvaluationResult): string {
  const fulfilled = result.wishResults.filter(
    (wish) => wish.status === "fulfilled"
  ).length;
  const unfulfilled = result.wishResults.filter(
    (wish) => wish.status === "unfulfilled"
  ).length;
  return [
    `objective: ${result.objective}`,
    `hard violations: ${result.hardViolations.length}`,
    `hall over-usages: ${result.overUsages.length}`,
    `wishes fulfilled/unfulfilled: ${fulfilled}/${unfulfilled}`,
    `Spielwoche misses: ${result.spielwocheMisses.length}`
  ].join("\n");
}
