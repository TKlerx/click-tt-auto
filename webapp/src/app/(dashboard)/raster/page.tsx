import { redirect } from "next/navigation";
import { listMatchReviewState } from "@/lib/raster/match-review";
import {
  defaultRasterStep,
  deriveRasterReadiness,
} from "@/lib/raster/readiness";
import {
  listInputSets,
  listRasterSourcesForScope,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";
import {
  RasterStepError,
  type RasterStepSearchParams,
  requireRasterStep,
} from "./_lib/step-context";

export default async function RasterPage({
  searchParams,
}: {
  searchParams: RasterStepSearchParams;
}) {
  const context = await requireRasterStep(searchParams);
  if ("error" in context) return <RasterStepError message={context.error} />;

  const [inputSets, sources] = await Promise.all([
    listInputSets(context.scope.id, context.season),
    listRasterSourcesForScope(context.scope.id, context.season),
  ]);
  const inputSet = inputSets[0] ?? null;
  const [capacityReview, matchReview] = inputSet
    ? await Promise.all([
        reviewHallCapacitiesForInputSet(inputSet.id),
        listMatchReviewState(inputSet.id),
      ])
    : [null, []];
  const readiness = deriveRasterReadiness({
    sourceCount: sources.length,
    inputSet,
    capacityReview,
    matchReviewOutstandingCount: matchReview.filter(
      (record) => record.status === "outstanding",
    ).length,
  });
  const params = new URLSearchParams({
    scope: context.scope.code,
    season: context.season,
  });

  redirect(`/raster/${defaultRasterStep(readiness)}?${params.toString()}`);
}
