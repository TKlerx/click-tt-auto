import type { SessionUser } from "@/lib/auth";
import {
  defaultRasterStep,
  deriveRasterReadiness,
  type RasterStep,
} from "@/lib/raster/readiness";
import { listMatchReviewState } from "@/lib/raster/match-review";
import { listAccessibleRasterScopes } from "@/lib/raster/access";
import {
  listInputSets,
  listRasterSourcesForScope,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";

export type ScopeReadinessRow = {
  scope: { id: string; code: string; name: string };
  complete: boolean;
  missing: string[];
  resolvedBy: RasterStep;
};

export async function buildReadinessAcrossScopes(
  user: Pick<SessionUser, "id" | "role">,
  season: string,
): Promise<ScopeReadinessRow[]> {
  const scopes = await listAccessibleRasterScopes(user);
  return Promise.all(
    scopes.map(async (scope) => {
      const readiness = await buildReadinessForScope(scope.id, season);
      const resolvedBy = defaultRasterStep(readiness);
      const missing = Object.values(readiness).flatMap(
        (step) => step.outstanding,
      );
      return {
        scope,
        complete: readiness.run.state === "ready" && missing.length === 0,
        missing: [...new Set(missing)],
        resolvedBy,
      };
    }),
  );
}

export async function buildReadinessForScope(scopeId: string, season: string) {
  const [inputSets, sources] = await Promise.all([
    listInputSets(scopeId, season),
    listRasterSourcesForScope(scopeId, season),
  ]);
  const inputSet = inputSets[0] ?? null;
  const [capacityReview, matchReview] = inputSet
    ? await Promise.all([
        reviewHallCapacitiesForInputSet(inputSet.id),
        listMatchReviewState(inputSet.id),
      ])
    : [null, []];

  return deriveRasterReadiness({
    sourceCount: sources.length,
    inputSet,
    capacityReview,
    matchReviewOutstandingCount: matchReview.filter(
      (record) => record.status === "outstanding",
    ).length,
  });
}
