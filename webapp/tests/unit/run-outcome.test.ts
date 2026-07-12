import { describe, expect, it } from "vitest";
import {
  mapOutcomeToSnapshotOptimality,
  mapSolverStatusToOutcome,
} from "@/lib/raster/run-outcome";
import {
  OptimizationRunOutcome,
  SnapshotOptimality,
} from "../../generated/prisma/enums";
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
});
