import { CapacityTable } from "@/components/raster/capacity/capacity-table";
import { ClubAliasReview } from "@/components/raster/capacity/club-alias-review";
import { InferCapacitiesButton } from "@/components/raster/capacity/infer-capacities-button";
import { MatchReviewPanel } from "@/components/raster/match-review-panel";
import { WishImportReviewPanel } from "@/components/raster/wish-import-review-panel";
import { canUseRasterLevel } from "@/lib/raster/access";
import { normalizeClubName } from "@/lib/raster/club-matching";
import {
  unresolvedSourceIdentityAliases,
  sourceIdentityCandidates,
} from "@/services/raster/sourceIdentityAliases";
import { listMatchReviewState } from "@/lib/raster/match-review";
import { resolveWorkspaceSelection } from "@/lib/raster/workspace-selection";
import { FixedScheduleNumbersForm } from "@/components/raster/input-set-actions";
import {
  GroupModeReview,
  GroupPlanningReview,
} from "@/components/raster/group-mode-review";
import { ManualAssignmentForm } from "@/components/raster/manual-assignment-form";
import { BaselineReview } from "@/components/raster/baseline/baseline-review";
import {
  listHallCapacities,
  getManualBaseline,
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
  const params = await searchParams;

  const [inputSets, capacities] = await Promise.all([
    listInputSets(context.scope.id, context.season),
    listHallCapacities(context.scope.id),
  ]);
  const inputSet = resolveWorkspaceSelection(
    inputSets,
    params.workspace,
  ).selected;
  const [
    capacityReview,
    matchReview,
    wishImportReview,
    baseline,
    pendingIdentityAliases,
  ] = inputSet
    ? await Promise.all([
        reviewHallCapacitiesForInputSet(inputSet.id),
        listMatchReviewState(inputSet.id),
        listWishImportReview(inputSet.id),
        getManualBaseline(inputSet.id),
        unresolvedSourceIdentityAliases(inputSet.id),
      ])
    : [null, [], null, null, []];
  const canEdit = canUseRasterLevel(context.user, "scheduler");
  const canAdministerAliases = canUseRasterLevel(context.user, "admin");
  const identityCandidates = [
    ...(capacityReview?.aliasCandidates ?? [])
      .filter(
        (candidate) =>
          !pendingIdentityAliases.some(
            (alias) =>
              alias.kind === "CLUB" &&
              normalizeClubName(
                candidate.wishClubName ?? candidate.modelClubName,
              ) === alias.normalizedSourceName,
          ),
      )
      .map((candidate) => ({
        ...candidate,
        kind: "CLUB" as const,
      })),
    ...pendingIdentityAliases.map((alias) => ({
      capacityRelevant: alias.kind === "CLUB",
      kind: alias.kind,
      modelClubId: alias.rawSourceName,
      modelClubName: alias.rawSourceName,
      wishClubId: alias.canonicalIdentity ?? undefined,
      wishClubName: alias.canonicalName ?? undefined,
      confidence: alias.matchConfidence,
      source: alias.source,
    })),
  ];
  const identityOptions = [
    ...(capacityReview?.wishClubOptions ?? []).map((option) => ({
      ...option,
      kind: "CLUB" as const,
    })),
    ...modelIdentityOptions(inputSet?.seasonModelJson),
  ];
  const planningGroups = inputSet
    ? extractPlanningGroups(
        inputSet.id,
        inputSet.seasonModelJson,
        inputSet.wishes,
      )
    : [];
  const missingMappingCount =
    planningGroups.filter(
      (group) => group.missingTeams > 0 || !group.planningStatus,
    ).length +
    identityCandidates.length +
    wishImportIssueCount(wishImportReview);

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
        <details
          className="mt-3 border-t border-[var(--border)] pt-3"
          open={missingMappingCount > 0}
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Missing mappings ({missingMappingCount})
          </summary>
          <div className="mt-3 grid gap-3">
            {capacityReview ? (
              <ClubAliasReview
                key={`${inputSet.id}:${JSON.stringify(identityCandidates)}`}
                canEdit={canAdministerAliases}
                candidates={identityCandidates}
                inputSetId={inputSet.id}
                wishClubOptions={identityOptions}
              />
            ) : null}
            {wishImportReview && wishImportIssueCount(wishImportReview) > 0 ? (
              <WishImportReviewPanel
                canEdit={canEdit}
                inputSetId={inputSet.id}
                review={wishImportReview}
                showMissing
              />
            ) : null}
            <GroupPlanningReview groups={planningGroups} />
            {missingMappingCount === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No missing mappings.
              </p>
            ) : null}
          </div>
        </details>
        <MatchReviewPanel
          canEdit={canEdit}
          inputSetId={inputSet.id}
          records={matchReview}
        />
        {baseline ? (
          <BaselineReview
            baseline={baseline}
            canEdit={canEdit}
            inputSetId={inputSet.id}
            teams={extractBaselineTeams(inputSet.seasonModelJson)}
          />
        ) : null}
        <details
          className="mt-3 border-t border-[var(--border)] pt-3"
          open={
            !!capacityReview &&
            (capacityReview.aliasCandidates.length > 0 ||
              capacityReview.blockingCount > 0)
          }
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Gym capacities
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {canEdit ? (
              <InferCapacitiesButton
                inputSetId={inputSet.id}
                label="Recheck capacities"
              />
            ) : null}
          </div>
          {capacityReview ? (
            <div className="my-3 grid gap-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                {capacityReview.inferredCount} inferred,{" "}
                {capacityReview.missingCount} missing,{" "}
                {capacityReview.insufficientCount} lower than inferred,{" "}
                {capacityReview.higherCount} higher than inferred.
              </p>
            </div>
          ) : null}
          <CapacityTable
            canEdit={canEdit}
            scope={context.scope.code}
            rows={capacities}
          />
        </details>
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
    </div>
  );
}

function extractBaselineTeams(seasonModelJson: string | null) {
  try {
    const model = JSON.parse(seasonModelJson ?? "{}") as {
      teams?: Array<{ id: string; label: string; group?: { name?: string } }>;
    };
    return (model.teams ?? []).map((team) => ({
      id: team.id,
      label: `${team.label}${team.group?.name ? ` — ${team.group.name}` : ""}`,
    }));
  } catch {
    return [];
  }
}

function wishImportIssueCount(
  review: Awaited<ReturnType<typeof listWishImportReview>> | null,
) {
  if (!review) return 0;
  return (
    review.conflicts.length +
    review.unmatchedRows.length +
    review.missingWishes.length
  );
}

function modelIdentityOptions(seasonModelJson?: string | null) {
  if (!seasonModelJson) return [];
  const model = JSON.parse(seasonModelJson);
  return (["CLUB", "TEAM"] as const).flatMap((kind) =>
    sourceIdentityCandidates(model, kind).map((candidate) => ({
      clubId: candidate.id,
      clubName: candidate.name,
      kind,
    })),
  );
}
