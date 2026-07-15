import {
  OptimizationRunOutcome,
  SnapshotOptimality,
} from "../../../generated/prisma/enums";
import type { SolverMetadata } from "@/lib/raster/solver-io";

export function mapSolverStatusToOutcome(status: SolverMetadata["status"]) {
  if (status === "OPTIMAL") return OptimizationRunOutcome.PROVEN_OPTIMAL;
  if (status === "FEASIBLE") return OptimizationRunOutcome.FEASIBLE;
  if (status === "INFEASIBLE") return OptimizationRunOutcome.INFEASIBLE;
  return OptimizationRunOutcome.FAILED;
}

export function mapOutcomeToSnapshotOptimality(
  outcome: OptimizationRunOutcome,
) {
  if (outcome === OptimizationRunOutcome.PROVEN_OPTIMAL) {
    return SnapshotOptimality.PROVEN_OPTIMAL;
  }
  if (outcome === OptimizationRunOutcome.FEASIBLE) {
    return SnapshotOptimality.FEASIBLE;
  }
  return null;
}
