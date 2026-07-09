import { evaluate } from "../score/evaluate.js";
import type {
  Assignment,
  EvaluationResult,
  SeasonModel,
  Weights
} from "../types.js";
import { defaultWeights } from "../types.js";

function arrangements(values: number[], length: number): number[][] {
  if (length === 0) return [[]];
  return values.flatMap((value, index) =>
    arrangements(
      values.filter((_, other) => other !== index),
      length - 1
    ).map((tail) => [value, ...tail])
  );
}

function factorial(value: number): number {
  return value <= 1 ? 1 : value * factorial(value - 1);
}

function betterThan(
  candidate: EvaluationResult,
  best: EvaluationResult
): boolean {
  return (
    candidate.hardViolations.length < best.hardViolations.length ||
    (candidate.hardViolations.length === best.hardViolations.length &&
      candidate.objective < best.objective)
  );
}

export function startingAssignment(model: SeasonModel): Assignment {
  const assignment: Assignment = {};
  for (const group of model.groups) {
    const used = new Set<number>();
    for (const teamId of group.teamIds) {
      const team = model.teams.find((candidate) => candidate.id === teamId);
      if (
        team?.rasterzahl.kind === "fixed" ||
        team?.rasterzahl.kind === "pinned"
      ) {
        assignment[teamId] = team.rasterzahl.value;
        used.add(team.rasterzahl.value);
      }
    }
    let next = 1;
    for (const teamId of group.teamIds) {
      if (assignment[teamId] !== undefined) continue;
      while (used.has(next)) next += 1;
      assignment[teamId] = next;
      used.add(next);
    }
  }
  return assignment;
}

export function optimize(
  model: SeasonModel,
  start: Assignment = startingAssignment(model),
  weights: Weights = defaultWeights
): Assignment {
  const startResult = evaluate(model, start, weights);
  let best = {
    assignment: { ...start },
    result: startResult
  };

  for (const group of model.groups) {
    const variableTeams = group.teamIds.filter((teamId) => {
      const team = model.teams.find((candidate) => candidate.id === teamId);
      return team?.rasterzahl.kind === "assignable";
    });

    const used = new Set(
      group.teamIds
        .filter((teamId) => !variableTeams.includes(teamId))
        .map((teamId) => best.assignment[teamId])
    );
    const available = Array.from(
      { length: group.size },
      (_, index) => index + 1
    ).filter((value) => !used.has(value));

    if (
      available.length === variableTeams.length &&
      factorial(available.length) <= 40_320
    ) {
      for (const permutation of arrangements(available, variableTeams.length)) {
        const candidate = { ...best.assignment };
        for (const [index, teamId] of variableTeams.entries()) {
          candidate[teamId] = permutation[index]!;
        }
        const result = evaluate(model, candidate, weights);
        if (betterThan(result, best.result)) {
          best = { assignment: candidate, result };
        }
      }
      continue;
    }

    // ponytail: large-group fallback is pair-swap hillclimb; exact 12! search is not worth owning here.
    let improved = true;
    while (improved) {
      improved = false;
      for (const [leftIndex, left] of variableTeams.entries()) {
        for (const right of variableTeams.slice(leftIndex + 1)) {
          const candidate = { ...best.assignment };
          const leftValue = candidate[left];
          candidate[left] = candidate[right]!;
          candidate[right] = leftValue!;
          const result = evaluate(model, candidate, weights);
          if (betterThan(result, best.result)) {
            best = { assignment: candidate, result };
            improved = true;
          }
        }
      }
    }
  }

  return best.assignment;
}
