import { CreateInputSetForm } from "@/components/raster/input-set-actions";
import { RasterSourcesPanel } from "@/components/raster/sources/raster-sources-panel";
import { WishImportReviewPanel } from "@/components/raster/wish-import-review-panel";
import { canUseRasterLevel } from "@/lib/raster/access";
import {
  listInputSets,
  listRasterSourcesForScope,
  listUpperLeagueReview,
  listWishImportReview,
} from "@/services/raster";
import {
  RasterStepError,
  type RasterStepSearchParams,
  requireRasterStep,
} from "../_lib/step-context";

export default async function RasterImportPage({
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
  const [review, upperLeagueReview] = inputSet
    ? await Promise.all([
        listWishImportReview(inputSet.id),
        listUpperLeagueReview(inputSet.id),
      ])
    : [null, null];
  const canEdit = canUseRasterLevel(context.user, "scheduler");

  return (
    <div className="space-y-4">
      <RasterSourcesPanel
        canEdit={canEdit}
        scopeCode={context.scope.code}
        inputSet={inputSet}
        season={context.season}
        scopes={context.scopes}
        sources={sources}
        upperLeagueReview={upperLeagueReview}
      />
      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Input set
          </h1>
        </div>
        {canEdit ? (
          <CreateInputSetForm
            scope={context.scope.code}
            season={context.season}
          />
        ) : null}
        {inputSet ? (
          <div className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{inputSet.name}</span>
            <span>{inputSet.status}</span>
            <span>{inputSet._count.wishes} wishes</span>
            <span>{inputSet._count.runs} runs</span>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No input set for this scope and season yet.
          </p>
        )}
      </section>
      {inputSet && review ? (
        <WishImportReviewPanel
          canEdit={canEdit}
          inputSetId={inputSet.id}
          review={review}
        />
      ) : null}
    </div>
  );
}
