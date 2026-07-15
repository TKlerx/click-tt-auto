export const scenarioOrigins = ["optimizer", "manual"] as const;
export const scenarioStrategies = [
  "initial_heuristic",
  "cp_sat",
  "manual",
] as const;
export const scenarioStatuses = [
  "queued",
  "running",
  "completed",
  "feasible",
  "failed",
  "cancelled",
  "no_solution",
] as const;

export type ScenarioOrigin = (typeof scenarioOrigins)[number];
export type ScenarioStrategy = (typeof scenarioStrategies)[number];
export type ScenarioStatus = (typeof scenarioStatuses)[number];

export type RasterScenario = {
  id: string;
  inputSetId: string;
  scope: string;
  season: string;
  name: string;
  origin: ScenarioOrigin;
  strategy: ScenarioStrategy;
  status: ScenarioStatus;
  settings: Record<string, unknown>;
  kpiSummary: import("./kpis").RasterKpiSummary | null;
  detailRef: string | null;
  stale: boolean;
  createdAt: string;
  finishedAt: string | null;
};

export function isComparableScenario(
  left: Pick<RasterScenario, "scope" | "season" | "inputSetId">,
  right: Pick<RasterScenario, "scope" | "season" | "inputSetId">,
) {
  return (
    left.scope === right.scope &&
    left.season === right.season &&
    left.inputSetId === right.inputSetId
  );
}
