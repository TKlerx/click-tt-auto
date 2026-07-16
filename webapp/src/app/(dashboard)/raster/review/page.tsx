import { Role } from "../../../../../generated/prisma/enums";
import { CapacityTable } from "@/components/raster/capacity/capacity-table";
import { InferCapacitiesButton } from "@/components/raster/capacity/infer-capacities-button";
import { MatchReviewPanel } from "@/components/raster/match-review-panel";
import { WishImportReviewPanel } from "@/components/raster/wish-import-review-panel";
import { listMatchReviewState } from "@/lib/raster/match-review";
import { FixedScheduleNumbersForm } from "@/components/raster/input-set-actions";
import {
  GroupModeReview,
  GroupPlanningReview,
} from "@/components/raster/group-mode-review";
import { ManualAssignmentForm } from "@/components/raster/manual-assignment-form";
import {
  listHallCapacities,
  listInputSets,
  listWishImportReview,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";
import {
  ModelWarnings,
  extractManualAssignmentTeams,
  extractModelWarnings,
  extractPlanningGroups,
  extractSixTeamGroups,
} from "../_lib/review-helpers";
import {
  RasterStepError,
  type RasterStepSearchParams,
  requireRasterStep,
} from "../_lib/step-context";

export default async function RasterReviewPage({
  searchParams,
}: {
  searchParams: RasterStepSearchParams;
}) {
  const context = await requireRasterStep(searchParams);
  if ("error" in context) return <RasterStepError message={context.error} />;

  const [inputSets, capacities] = await Promise.all([
    listInputSets(context.scope.id, context.season),
    listHallCapacities(context.scope.id),
  ]);
  const inputSet = inputSets[0] ?? null;
  const [capacityReview, matchReview, wishImportReview] = inputSet
    ? await Promise.all([
        reviewHallCapacitiesForInputSet(inputSet.id),
        listMatchReviewState(inputSet.id),
        listWishImportReview(inputSet.id),
      ])
    : [null, [], null];
  const canEdit = context.user.role === Role.PLATFORM_ADMIN;

  if (!inputSet) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        Create an input set in Import data before reviewing.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {inputSet.name}
        </h1>
        {canEdit ? (
          <FixedScheduleNumbersForm
            inputSetId={inputSet.id}
            rows={inputSet.fixedRasterzahlen}
          />
        ) : null}
        <ModelWarnings
          warnings={extractModelWarnings(inputSet.seasonModelJson)}
        />
        <MatchReviewPanel
          canEdit={canEdit}
          inputSetId={inputSet.id}
          records={matchReview}
        />
        {wishImportReview ? (
          <div className="mt-3">
            <WishImportReviewPanel
              canEdit={canEdit}
              inputSetId={inputSet.id}
              review={wishImportReview}
              showMissing
            />
          </div>
        ) : null}
        <GroupPlanningReview
          groups={extractPlanningGroups(
            inputSet.id,
            inputSet.seasonModelJson,
            inputSet.wishes,
          )}
        />
        <GroupModeReview
          groups={extractSixTeamGroups(inputSet.id, inputSet.seasonModelJson)}
        />
        {canEdit ? (
          <ManualAssignmentForm
            inputSetId={inputSet.id}
            teams={extractManualAssignmentTeams(inputSet.seasonModelJson)}
          />
        ) : null}
      </section>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Gym capacities
          </h2>
          {canEdit ? (
            <InferCapacitiesButton
              inputSetId={inputSet.id}
              label="Recheck capacities"
            />
          ) : null}
        </div>
        {capacityReview ? (
          <p className="mb-3 text-sm text-[var(--muted-foreground)]">
            {capacityReview.inferredCount} inferred,{" "}
            {capacityReview.missingCount} missing,{" "}
            {capacityReview.insufficientCount} lower than inferred,{" "}
            {capacityReview.higherCount} higher than inferred.
          </p>
        ) : null}
        <CapacityTable
          canEdit={canEdit}
          scope={context.scope.code}
          rows={capacities}
        />
      </section>
    </div>
  );
}
