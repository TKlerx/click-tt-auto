import { InputSetRunActions } from "@/components/raster/input-set-actions";
import { canUseRasterLevel } from "@/lib/raster/access";
import {
  listInputSets,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";
import {
  RasterStepError,
  type RasterStepSearchParams,
  requireRasterStep,
} from "../_lib/step-context";

export default async function RasterRunPage({
  searchParams,
}: {
  searchParams: RasterStepSearchParams;
}) {
  const context = await requireRasterStep(searchParams);
  if ("error" in context) return <RasterStepError message={context.error} />;

  const inputSet =
    (await listInputSets(context.scope.id, context.season))[0] ?? null;
  const capacityReview = inputSet
    ? await reviewHallCapacitiesForInputSet(inputSet.id)
    : null;
  const hasExclusions = inputSet
    ? seasonModelHasExclusions(inputSet.seasonModelJson)
    : false;

  if (!inputSet) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        Create an input set in Import data before running the optimizer.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Run optimizer
      </h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        {hasExclusions
          ? "This run is provisional because excluded groups are not planned yet."
          : "The goal is a run covering every group in this input set."}
      </p>
      {canUseRasterLevel(context.user, "scheduler") ? (
        <InputSetRunActions
          capacityReview={capacityReview ?? undefined}
          combined={inputSet.spannedScopes.length > 1}
          inputSetId={inputSet.id}
          runs={inputSet.runs}
          showCapacityReview={false}
          status={inputSet.status}
        />
      ) : (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          You can view this step, but run controls are only shown to schedulers.
        </p>
      )}
    </section>
  );
}

function seasonModelHasExclusions(seasonModelJson: string | null) {
  if (!seasonModelJson) return false;
  try {
    const parsed = JSON.parse(seasonModelJson) as {
      groups?: Array<{ planningStatus?: string | null }>;
    };
    return (parsed.groups ?? []).some(
      (group) => group.planningStatus === "exclude",
    );
  } catch {
    return false;
  }
}
