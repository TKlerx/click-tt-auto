import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { scenarioFromRun } from "@/services/raster/scenarios";

const baseRun = {
  id: "run-1",
  inputSetId: "input-1",
  status: "SUCCEEDED",
  objectiveValue: 0,
  objectiveBreakdown: "{}",
  solverStatus: null,
  settings: JSON.stringify({ strategy: "cp_sat" }),
  createdAt: new Date("2026-07-10T00:00:00Z"),
  finishedAt: new Date("2026-07-10T00:01:00Z"),
  inputSet: {
    district: "OWL",
    season: "2026/27",
  },
  snapshot: null,
};

describe("raster run scenario status mapping", () => {
  it.each([
    ["PENDING", null, "queued"],
    ["RUNNING", null, "running"],
    ["FAILED", "FAILED", "failed"],
    ["SUCCEEDED", "FEASIBLE", "feasible"],
    ["SUCCEEDED", "PROVEN_OPTIMAL", "completed"],
    ["SUCCEEDED", "INFEASIBLE", "no_solution"],
  ])("maps %s/%s to %s", (status, outcome, scenarioStatus) => {
    expect(
      scenarioFromRun({
        ...baseRun,
        status,
        outcome,
      }).status,
    ).toBe(scenarioStatus);
  });

  it("maps manual settings to a manual scenario", () => {
    expect(
      scenarioFromRun({
        ...baseRun,
        outcome: "FEASIBLE",
        settings: JSON.stringify({
          strategy: "manual",
          name: "Colleague plan",
        }),
      }),
    ).toMatchObject({
      origin: "manual",
      strategy: "manual",
      name: "Colleague plan",
    });
  });
});
