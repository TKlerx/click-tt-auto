import {
  isComparableScenario,
  type RasterScenario,
} from "@/lib/raster/scenarios";
import { getScenariosByIds } from "@/services/raster/scenarios";

export type ScenarioComparison = {
  scenarios: RasterScenario[];
  baselineScenarioId: string | null;
  deltas: Record<string, Record<string, number | null>>;
};

const kpiKeys = [
  "objective",
  "totalHallExcess",
  "maxHallExcess",
  "affectedClubs",
  "wishMisses",
  "sameClubDerbyIssues",
] as const;

export async function compareScenarioIds(
  scenarioIds: string[],
  baselineScenarioId?: string | null,
) {
  const scenarios = await getScenariosByIds([...new Set(scenarioIds)]);
  return compareScenarios(scenarios, baselineScenarioId);
}

export function compareScenarios(
  scenarios: RasterScenario[],
  baselineScenarioId?: string | null,
): ScenarioComparison {
  if (scenarios.length < 2) {
    throw new Error("At least two scenarios are required");
  }
  const [first, ...rest] = scenarios;
  if (rest.some((scenario) => !isComparableScenario(first!, scenario))) {
    throw new Error("Scenarios are not compatible");
  }

  const baseline =
    scenarios.find((scenario) => scenario.id === baselineScenarioId) ??
    scenarios[0]!;
  return {
    scenarios,
    baselineScenarioId: baseline.id,
    deltas: Object.fromEntries(
      scenarios.map((scenario) => [scenario.id, kpiDelta(scenario, baseline)]),
    ),
  };
}

function kpiDelta(scenario: RasterScenario, baseline: RasterScenario) {
  return Object.fromEntries(
    kpiKeys.map((key) => {
      const value = scenario.kpiSummary?.[key];
      const baselineValue = baseline.kpiSummary?.[key];
      return [
        key,
        typeof value === "number" && typeof baselineValue === "number"
          ? value - baselineValue
          : null,
      ];
    }),
  );
}
