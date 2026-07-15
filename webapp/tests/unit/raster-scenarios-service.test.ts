import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { isComparableScenario } from "@/lib/raster/scenarios";
import { listScenarios, scenarioFromRun } from "@/services/raster/scenarios";

describe("raster scenario service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists optimizer runs as scenarios for the requested scope", async () => {
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({
        id: "run-1",
        outcome: "FEASIBLE",
        settings: JSON.stringify({ strategy: "cp_sat", name: "CP-SAT" }),
      }),
    ] as never);

    await expect(
      listScenarios({
        scopeId: "scope-owl",
        season: "2026/27",
        inputSetId: "input-1",
      }),
    ).resolves.toMatchObject([
      {
        id: "run-1",
        inputSetId: "input-1",
        district: "OWL",
        season: "2026/27",
        name: "CP-SAT",
        origin: "optimizer",
        strategy: "cp_sat",
        status: "feasible",
      },
    ]);

    expect(prismaMock.rasterOptimizationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inputSetId: "input-1",
          inputSet: { scopeId: "scope-owl", season: "2026/27" },
        },
      }),
    );
  });

  it("uses district, season, and input set as the compatibility boundary", () => {
    const base = scenarioFromRun(runFixture());
    expect(isComparableScenario(base, { ...base })).toBe(true);
    expect(
      isComparableScenario(base, { ...base, inputSetId: "other-input" }),
    ).toBe(false);
  });
});

function runFixture(overrides = {}) {
  return {
    id: "run-1",
    inputSetId: "input-1",
    status: "SUCCEEDED",
    outcome: "PROVEN_OPTIMAL",
    objectiveValue: 42,
    objectiveBreakdown: null,
    solverStatus: "OPTIMAL",
    settings: "{}",
    createdAt: new Date("2026-07-12T10:00:00.000Z"),
    finishedAt: new Date("2026-07-12T10:06:00.000Z"),
    inputSet: { scope: { code: "OWL" }, season: "2026/27" },
    snapshot: {
      id: "snapshot-1",
      stale: false,
      totalExcess: 1,
      maxExcess: 1,
      affectedClubs: 1,
      objectiveBreakdown: "{}",
    },
    ...overrides,
  };
}
