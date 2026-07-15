import type { RasterScenario } from "@/lib/raster/scenarios";

export function scenarioFixture(
  overrides: Partial<RasterScenario> = {},
): RasterScenario {
  return {
    id: "scenario_1",
    inputSetId: "input_set_1",
    scope: "OWL",
    season: "2026/27",
    name: "CP-SAT 10 min",
    origin: "optimizer",
    strategy: "cp_sat",
    status: "feasible",
    settings: { timeLimitSeconds: 600 },
    kpiSummary: {
      objective: 1234,
      totalHallExcess: 8,
      maxHallExcess: 2,
      affectedClubs: 5,
      wishMisses: 3,
      sameClubDerbyIssues: 0,
      status: "FEASIBLE",
    },
    detailRef: "/raster/scenarios/scenario_1",
    stale: false,
    createdAt: "2026-07-12T10:00:00.000Z",
    finishedAt: "2026-07-12T10:06:00.000Z",
    ...overrides,
  };
}
