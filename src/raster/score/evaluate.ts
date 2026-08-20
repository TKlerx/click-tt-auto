import {
  derbySpieltag,
  numericRasterSize,
  relation,
  rasterSizeForGroupSize
} from "../rulebook/rulebook.js";
import { deriveHomeWeeks, unusedRasterzahl } from "./derive.js";
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
    const rasterSize = rasterSizeForGroupSize(group.size, group.rasterMode);
    const maxRasterzahl = numericRasterSize(rasterSize);
    const values = group.teamIds.map((teamId) => assignment[teamId]);
    const assignedValues = values.filter(
      (value): value is number => value !== undefined
    );
    const bye =
      group.size % 2 === 1
        ? Array.from({ length: maxRasterzahl }, (_, index) => index + 1).find(
            (value) => !assignedValues.includes(value)
          )
        : null;
    const valid =
      assignedValues.length === values.length &&
      new Set(assignedValues).size === assignedValues.length &&
      assignedValues.every((value) => value >= 1 && value <= maxRasterzahl);
    if (!valid)
      hardViolations.push({
        kind: "permutation",
        detail: `${group.ref.league} ${group.ref.name} is not a valid 1..${maxRasterzahl} permutation`
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
        if (left.planned === false && right.planned === false) continue;
        if (leftRz === bye || rightRz === bye) continue;
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
  const wishResults = evaluateWishes(model, assignment);
  const spielwocheMisses = evaluateSpielwocheRhythm(model, assignment);
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

function evaluateSpielwocheRhythm(
  model: SeasonModel,
  assignment: Assignment
): EvaluationResult["spielwocheMisses"] {
  const misses: EvaluationResult["spielwocheMisses"] = [];
  const teams = model.teams.filter(
    (team) => team.capacityRelevant !== false && team.spielwochePref
  );
  for (const [leftIndex, left] of teams.entries()) {
    for (const right of teams.slice(leftIndex + 1)) {
      if (
        left.clubId !== right.clubId ||
        left.hall !== right.hall ||
        left.homeWeekday !== right.homeWeekday
      ) {
        continue;
      }
      const groupA = model.groups.find((group) => group.teamIds.includes(left.id));
      const groupB = model.groups.find((group) => group.teamIds.includes(right.id));
      const rzA = assignment[left.id];
      const rzB = assignment[right.id];
      if (!groupA || !groupB || rzA === undefined || rzB === undefined) continue;
      const byeA = unusedRasterzahl(groupA, assignment);
      const byeB = unusedRasterzahl(groupB, assignment);
      const derivedA = deriveHomeWeeks(
        groupA.size,
        rzA,
        groupA.rasterMode,
        byeA
      );
      const derivedB = deriveHomeWeeks(
        groupB.size,
        rzB,
        groupB.rasterMode,
        byeB
      );
      const got =
        byeA !== null || byeB !== null
          ? relationFromWeeks(derivedA.weeks, derivedB.weeks)
          : relation(derivedA.rasterSize, rzA, derivedB.rasterSize, rzB);
      const want =
        left.spielwochePref === right.spielwochePref ? "zeitgleich" : "wechsel";
      if (got !== want) {
        misses.push({ teamA: left.id, teamB: right.id, want, got });
      }
    }
  }
  return misses;
}

function relationFromWeeks(
  weeksA: number[],
  weeksB: number[]
): "wechsel" | "zeitgleich" | "neither" {
  const a = new Set(weeksA);
  const b = new Set(weeksB);
  const overlap = [...a].filter((week) => b.has(week)).length;
  if (overlap === 0) return "wechsel";
  if (overlap === Math.min(a.size, b.size)) return "zeitgleich";
  return "neither";
}
