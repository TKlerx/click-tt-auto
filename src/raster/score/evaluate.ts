import { derbySpieltag, rasterSizeForGroupSize } from "../rulebook/rulebook.js";
import { deriveHomeWeeks } from "./derive.js";
import { evaluateWishes, findOverUsages } from "./penalties.js";
import type {
  Assignment,
  EvaluationResult,
  HardViolation,
  OverUsage,
  SeasonModel,
  Weights
} from "../types.js";
import { defaultWeights } from "../types.js";

export function completeAssignment(
  model: SeasonModel,
  assignment: Assignment
): Assignment {
  const full = { ...assignment };
  for (const team of model.teams) {
    if (team.rasterzahl.kind === "fixed" || team.rasterzahl.kind === "pinned") {
      full[team.id] = team.rasterzahl.value;
    }
  }
  return full;
}

export function overUsageFairnessCost(overUsages: OverUsage[]): number {
  const excessByClub = new Map<string, number>();
  for (const usage of overUsages) {
    excessByClub.set(
      usage.clubId,
      (excessByClub.get(usage.clubId) ?? 0) + usage.excess
    );
  }
  return [...excessByClub.values()].reduce((sum, excess) => sum + excess ** 2, 0);
}

export function evaluate(
  model: SeasonModel,
  partialAssignment: Assignment,
  weights: Weights = defaultWeights
): EvaluationResult {
  const assignment = completeAssignment(model, partialAssignment);
  const hardViolations: HardViolation[] = [];
  const perGroup: EvaluationResult["perGroup"] = [];
  let sameClubDerbySt4 = 0;

  for (const group of model.groups) {
    const rasterSize = rasterSizeForGroupSize(group.size);
    const values = group.teamIds.map((teamId) => assignment[teamId]);
    const assignedValues = values.filter(
      (value): value is number => value !== undefined
    );
    const valid =
      assignedValues.length === values.length &&
      new Set(assignedValues).size === assignedValues.length &&
      assignedValues.every((value) => value >= 1 && value <= group.size);
    if (!valid)
      hardViolations.push({
        kind: "permutation",
        detail: `${group.ref.league} ${group.ref.name} is not a valid 1..${group.size} permutation`
      });
    perGroup.push({
      group: group.ref,
      assignment: Object.fromEntries(
        group.teamIds.map((teamId) => [teamId, assignment[teamId] ?? 0])
      ),
      valid
    });

    for (const [leftIndex, leftId] of group.teamIds.entries()) {
      const left = model.teams.find((team) => team.id === leftId);
      const leftRz = assignment[leftId];
      if (!left || leftRz === undefined) continue;
      for (const rightId of group.teamIds.slice(leftIndex + 1)) {
        const right = model.teams.find((team) => team.id === rightId);
        const rightRz = assignment[rightId];
        if (!right || rightRz === undefined || left.clubId !== right.clubId)
          continue;
        const spieltag = derbySpieltag(rasterSize, leftRz, rightRz);
        if (spieltag !== undefined && spieltag > 4)
          hardViolations.push({
            kind: "derby-late",
            detail: `${left.id}/${right.id} meet on Spieltag ${spieltag}`
          });
        if (spieltag === 4) sameClubDerbySt4++;
      }
    }
  }

  for (const team of model.teams) {
    if (
      (team.rasterzahl.kind === "fixed" || team.rasterzahl.kind === "pinned") &&
      assignment[team.id] !== team.rasterzahl.value
    ) {
      hardViolations.push({
        kind: "fixed-altered",
        detail: `${team.id} must stay ${team.rasterzahl.value}`
      });
    }
  }

  const overUsages = findOverUsages(model, assignment);
  for (const usage of overUsages.filter((usage) => usage.excess > 1)) {
    hardViolations.push({
      kind: "capacity-overflow",
      detail: `${usage.clubId}/${usage.weekday}/hall ${usage.hall}/week ${usage.week} has ${usage.teams.length} teams, capacity ${usage.capacity}`
    });
  }
  const wishResults = evaluateWishes(model, assignment);
  const spielwocheMisses = model.teams.flatMap((team) => {
    if (!team.spielwochePref) return [];
    const group = model.groups.find((candidate) =>
      candidate.teamIds.includes(team.id)
    );
    const rz = assignment[team.id];
    if (!group || rz === undefined) return [];
    const got = deriveHomeWeeks(group.size, rz).slot;
    return got === team.spielwochePref
      ? []
      : [{ teamId: team.id, want: team.spielwochePref, got }];
  });
  const brokenWechsel = wishResults.filter(
    (result) =>
      result.status === "unfulfilled" && result.wish.relation === "wechsel"
  ).length;
  const brokenZeitgleich = wishResults.filter(
    (result) =>
      result.status === "unfulfilled" && result.wish.relation === "zeitgleich"
  ).length;
  const objective =
    overUsages.reduce((sum, usage) => sum + usage.excess ** 2, 0) * weights.overUsage +
    overUsageFairnessCost(overUsages) * weights.overUsageFairness +
    brokenWechsel * weights.wechsel +
    brokenZeitgleich * weights.zeitgleich +
    sameClubDerbySt4 * weights.sameClubDerbySt4 +
    spielwocheMisses.length * weights.spielwoche;

  return {
    assignment,
    objective,
    hardViolations,
    overUsages,
    wishResults,
    spielwocheMisses,
    perGroup
  };
}
