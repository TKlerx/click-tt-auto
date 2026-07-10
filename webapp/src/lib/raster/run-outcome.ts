import {
  derbySpieltag,
  rasterSizeForGroupSize,
} from "../../../../src/raster/rulebook/index.js";
import {
  evaluate,
  overUsageFairnessCost,
} from "../../../../src/raster/score/index.js";
import {
  defaultWeights,
  type Assignment,
  type SeasonModel,
} from "../../../../src/raster/types.js";
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

export function buildObjectiveBreakdown(
  model: SeasonModel,
  assignment: Assignment,
  weights = defaultWeights,
) {
  const result = evaluate(model, assignment, weights);
  let sameClubDerbySt4 = 0;
  for (const group of model.groups) {
    const rasterSize = rasterSizeForGroupSize(group.size);
    for (const [leftIndex, leftId] of group.teamIds.entries()) {
      const left = model.teams.find((team) => team.id === leftId);
      const leftRz = result.assignment[leftId];
      if (!left || leftRz === undefined) continue;
      for (const rightId of group.teamIds.slice(leftIndex + 1)) {
        const right = model.teams.find((team) => team.id === rightId);
        const rightRz = result.assignment[rightId];
        if (!right || rightRz === undefined || left.clubId !== right.clubId)
          continue;
        if (derbySpieltag(rasterSize, leftRz, rightRz) === 4)
          sameClubDerbySt4++;
      }
    }
  }
  const brokenWechsel = result.wishResults.filter(
    (entry) =>
      entry.status === "unfulfilled" && entry.wish.relation === "wechsel",
  ).length;
  const brokenZeitgleich = result.wishResults.filter(
    (entry) =>
      entry.status === "unfulfilled" && entry.wish.relation === "zeitgleich",
  ).length;

  return {
    overUsage:
      result.overUsages.reduce((sum, usage) => sum + usage.excess ** 2, 0) *
      weights.overUsage,
    overUsageFairness:
      overUsageFairnessCost(result.overUsages) * weights.overUsageFairness,
    wechsel: brokenWechsel * weights.wechsel,
    zeitgleich: brokenZeitgleich * weights.zeitgleich,
    sameClubDerbySt4: sameClubDerbySt4 * weights.sameClubDerbySt4,
    spielwoche: result.spielwocheMisses.length * weights.spielwoche,
  };
}

export function assertPersistableSnapshot(
  model: SeasonModel,
  assignment: Assignment,
) {
  const result = evaluate(model, assignment);
  if (result.hardViolations.length) {
    throw new Error(
      result.hardViolations.map((violation) => violation.detail).join("; "),
    );
  }
  return result;
}
