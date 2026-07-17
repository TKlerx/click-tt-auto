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

export function infeasibleScopeMessage(coverageJson?: string | null) {
  const scope = firstSpannedScope(coverageJson);
  return scope
    ? `No feasible assignment for constraints including ${scope}.`
    : "No feasible assignment exists with the current hard constraints.";
}

function firstSpannedScope(coverageJson?: string | null) {
  if (!coverageJson) return null;
  try {
    const parsed = JSON.parse(coverageJson) as { spannedScopes?: unknown };
    return Array.isArray(parsed.spannedScopes) && parsed.spannedScopes[0]
      ? String(parsed.spannedScopes[0])
      : null;
  } catch {
    return null;
  }
}
