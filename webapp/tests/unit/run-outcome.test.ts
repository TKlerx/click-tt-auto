import { describe, expect, it } from "vitest";
import {
  buildObjectiveBreakdown,
  mapOutcomeToSnapshotOptimality,
  mapSolverStatusToOutcome,
} from "@/lib/raster/run-outcome";
import {
  OptimizationRunOutcome,
  SnapshotOptimality,
} from "../../generated/prisma/enums";
import type { SeasonModel } from "../../../src/raster/types";

function derbyModel(): SeasonModel {
  return {
    clubs: [{ id: "elsen", name: "TuRa Elsen", venues: [], notes: "" }],
    teams: [
      {
        id: "elsen-1",
        clubId: "elsen",
        label: "TuRa Elsen I",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok",
      },
      {
        id: "elsen-2",
        clubId: "elsen",
        label: "TuRa Elsen II",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok",
      },
    ],
    groups: [
      {
        ref: { league: "L", name: "G12" },
        size: 12,
        teamIds: ["elsen-1", "elsen-2"],
      },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
}

describe("raster run outcome helpers", () => {
  it("maps CP-SAT statuses to persisted run outcomes", () => {
    expect(mapSolverStatusToOutcome("OPTIMAL")).toBe(
      OptimizationRunOutcome.PROVEN_OPTIMAL,
    );
    expect(mapSolverStatusToOutcome("FEASIBLE")).toBe(
      OptimizationRunOutcome.FEASIBLE,
    );
    expect(mapSolverStatusToOutcome("INFEASIBLE")).toBe(
      OptimizationRunOutcome.INFEASIBLE,
    );
    expect(mapSolverStatusToOutcome("UNKNOWN")).toBe(
      OptimizationRunOutcome.FAILED,
    );
  });

  it("maps only successful outcomes to snapshot optimality", () => {
    expect(
      mapOutcomeToSnapshotOptimality(OptimizationRunOutcome.PROVEN_OPTIMAL),
    ).toBe(SnapshotOptimality.PROVEN_OPTIMAL);
    expect(
      mapOutcomeToSnapshotOptimality(OptimizationRunOutcome.FEASIBLE),
    ).toBe(SnapshotOptimality.FEASIBLE);
    expect(
      mapOutcomeToSnapshotOptimality(OptimizationRunOutcome.FAILED),
    ).toBeNull();
  });

  it("persists the ST4 derby objective component", () => {
    expect(
      buildObjectiveBreakdown(derbyModel(), {
        "elsen-1": 3,
        "elsen-2": 4,
      }).sameClubDerbySt4,
    ).toBe(1000);
  });
});
