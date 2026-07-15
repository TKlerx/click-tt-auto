import { InputSetStatus } from "../../../generated/prisma/enums";

export const rasterSteps = ["import", "review", "run", "runs"] as const;

export type RasterStep = (typeof rasterSteps)[number];
export type RasterStepState =
  | "not-started"
  | "outstanding"
  | "ready"
  | "blocked";

export type RasterStepReadiness = {
  state: RasterStepState;
  outstanding: string[];
  resolvedBy?: RasterStep;
  hasExclusions: boolean;
};

export type RasterReadinessInput = {
  sourceCount: number;
  inputSet?: {
    status: InputSetStatus | "DRAFT" | "READY";
    seasonModelJson?: string | null;
    runs?: Array<{ snapshot?: unknown | null; status?: string | null }>;
  } | null;
  capacityReview?: {
    blockingCount: number;
    missingCount?: number;
    insufficientCount?: number;
  } | null;
  matchReviewOutstandingCount?: number;
};

type ParsedSeasonModel = {
  groups?: Array<{
    size?: number;
    rasterMode?: "single" | "double" | null;
    planningStatus?: "include" | "exclude" | null;
    teamIds?: string[];
  }>;
  teams?: Array<{ id?: string; capacityRelevant?: boolean | null }>;
};

export function deriveRasterReadiness(input: RasterReadinessInput) {
  const model = parseSeasonModel(input.inputSet?.seasonModelJson);
  const hasSources = input.sourceCount > 0;
  const hasInputSet = Boolean(input.inputSet);
  const hasExclusions = (model.groups ?? []).some(
    (group) => group.planningStatus === "exclude",
  );
  const reviewOutstanding = reviewOutstandingReasons(
    model,
    input.capacityReview,
    input.matchReviewOutstandingCount ?? 0,
  );
  const importOutstanding = [
    ...(!hasSources ? ["Add source data"] : []),
    ...(!hasInputSet ? ["Create an input set"] : []),
  ];
  const runBlocking = [
    ...importOutstanding,
    ...reviewOutstanding,
    ...(input.inputSet?.status !== InputSetStatus.READY
      ? ["Validate the input set"]
      : []),
  ];
  const hasFinishedRuns = Boolean(
    input.inputSet?.runs?.some(
      (run) => run.snapshot || run.status === "SUCCEEDED",
    ),
  );

  return {
    import: step(importOutstanding.length ? "outstanding" : "ready", {
      outstanding: importOutstanding,
      hasExclusions,
    }),
    review: step(reviewOutstanding.length ? "outstanding" : "ready", {
      outstanding: reviewOutstanding,
      hasExclusions,
    }),
    run: step(runBlocking.length ? "blocked" : "ready", {
      outstanding: runBlocking,
      resolvedBy: runBlocking.some((reason) => importOutstanding.includes(reason))
        ? "import"
        : runBlocking.length
          ? "review"
          : undefined,
      hasExclusions,
    }),
    runs: step(hasFinishedRuns ? "ready" : "not-started", {
      outstanding: hasFinishedRuns ? [] : ["Run the optimizer"],
      resolvedBy: hasFinishedRuns ? undefined : "run",
      hasExclusions,
    }),
  } satisfies Record<RasterStep, RasterStepReadiness>;
}

export function defaultRasterStep(
  readiness: Record<RasterStep, RasterStepReadiness>,
): RasterStep {
  return (
    rasterSteps.find((stepName) =>
      ["outstanding", "blocked", "not-started"].includes(
        readiness[stepName].state,
      ),
    ) ?? "runs"
  );
}

function step(
  state: RasterStepState,
  rest: Omit<RasterStepReadiness, "state">,
): RasterStepReadiness {
  return { state, ...rest };
}

function reviewOutstandingReasons(
  model: ParsedSeasonModel,
  capacityReview: RasterReadinessInput["capacityReview"],
  matchReviewOutstandingCount: number,
) {
  const reasons: string[] = [];
  const teams = new Map((model.teams ?? []).map((team) => [team.id, team]));
  const missingWishGroups = (model.groups ?? []).filter(
    (group) =>
      group.planningStatus !== "exclude" &&
      (group.teamIds ?? []).some(
        (teamId) => teams.get(teamId)?.capacityRelevant === false,
      ),
  );
  if (missingWishGroups.length) {
    reasons.push("Review groups with missing wishes");
  }
  if (
    (model.groups ?? []).some(
      (group) =>
        group.planningStatus !== "exclude" &&
        Number(group.size) === 6 &&
        group.rasterMode !== "single" &&
        group.rasterMode !== "double",
    )
  ) {
    reasons.push("Confirm six-team group mode");
  }
  if ((capacityReview?.blockingCount ?? 0) > 0) {
    reasons.push("Review gym capacities");
  }
  if (matchReviewOutstandingCount > 0) {
    reasons.push("Review source-to-model matches");
  }
  return reasons;
}

function parseSeasonModel(value?: string | null): ParsedSeasonModel {
  if (!value) return {};
  try {
    return JSON.parse(value) as ParsedSeasonModel;
  } catch {
    return {};
  }
}
