import { CreateInputSetForm } from "@/components/raster/input-set-actions";
import { RasterSourcesPanel } from "@/components/raster/sources/raster-sources-panel";
import { WishImportReviewPanel } from "@/components/raster/wish-import-review-panel";
import { canUseRasterLevel } from "@/lib/raster/access";
import { resolveWorkspaceSelection } from "@/lib/raster/workspace-selection";
import {
  adoptLegacyRasterSources,
  listInputSets,
  listUpperLeagueReview,
  listRasterSourcesForInputSet,
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
  const params = await searchParams;

  const inputSets = await listInputSets(context.scope.id, context.season);
  const selection = resolveWorkspaceSelection(inputSets, params.workspace);
  const inputSet = selection.selected;
  const canEdit = canUseRasterLevel(context.user, "scheduler");
  if (inputSet && canEdit) await adoptLegacyRasterSources(inputSet.id);
  const sources = inputSet
    ? await listRasterSourcesForInputSet(inputSet.id)
    : [];
  const [review, upperLeagueReview] = inputSet
    ? await Promise.all([
        listWishImportReview(inputSet.id),
        listUpperLeagueReview(inputSet.id),
      ])
    : [null, null];

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Import context
          </p>
          <h1 className="mt-1 text-lg font-semibold">
            {context.scope.code} · {context.season}
          </h1>
        </div>
        {selection.showSelector ? (
          <form className="grid gap-3 border-b border-[var(--border)] px-4 py-3 text-sm md:grid-cols-[minmax(12rem,1fr)_auto]">
            <input name="scope" type="hidden" value={context.scope.code} />
            <input name="season" type="hidden" value={context.season} />
            <label className="grid gap-1 font-medium">
              Planning workspace
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
                defaultValue={inputSet?.id}
                name="workspace"
              >
                {inputSets.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="h-10 self-end rounded-md border border-[var(--border)] px-4 text-sm font-medium"
              type="submit"
            >
              Select
            </button>
          </form>
        ) : null}
        {canEdit ? (
          <CreateInputSetForm
            scope={context.scope.code}
            season={context.season}
          />
        ) : null}
        {inputSet ? (
          <div className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3 px-4 py-3 text-sm">
            <span className="font-medium">
              Active workspace: {inputSet.name}
            </span>
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
      <RasterSourcesPanel
        canEdit={canEdit}
        inputSet={inputSet}
        scopeCode={context.scope.code}
        season={context.season}
        sources={sources}
        upperLeagueReview={upperLeagueReview}
      />
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
