import { GapSummary } from "@/components/raster/combined/gap-summary";
import { StartCombinedRunForm } from "@/components/raster/combined/start-combined-run-form";
import { buildCoverageRecordForScopes } from "@/lib/raster/coverage";
import { RasterStepError, requireRasterStep } from "../_lib/step-context";

type CombinedSearchParams = Promise<{
  scope?: string;
  season?: string;
  scopes?: string | string[];
}>;

export default async function RasterCombinedPage({
  searchParams,
}: {
  searchParams: CombinedSearchParams;
}) {
  const context = await requireRasterStep(searchParams);
  if ("error" in context) return <RasterStepError message={context.error} />;

  const params = await searchParams;
  const requestedScopes = Array.isArray(params.scopes)
    ? params.scopes
    : params.scopes?.split(",").filter(Boolean);
  const selectedScopeIds = (
    requestedScopes ?? context.scopes.slice(0, 2).map((scope) => scope.id)
  ).filter((scopeId) => context.scopes.some((scope) => scope.id === scopeId));
  const selected = new Set(selectedScopeIds);
  const coverage =
    selectedScopeIds.length >= 2
      ? await buildCoverageRecordForScopes(selectedScopeIds, context.season)
      : null;

  return (
    <section className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Combined planning
      </h1>
      <form className="grid gap-2" method="get">
        <input name="scope" type="hidden" value={context.scope.code} />
        <input name="season" type="hidden" value={context.season} />
        <div className="grid gap-2 md:grid-cols-2">
          {context.scopes.map((scope) => (
            <label
              className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={scope.id}
            >
              <input
                defaultChecked={selected.has(scope.id)}
                name="scopes"
                type="checkbox"
                value={scope.id}
              />
              <span>{scope.name}</span>
            </label>
          ))}
        </div>
        <button
          className="h-9 w-fit rounded-md border border-[var(--border)] px-3 text-sm font-medium"
          type="submit"
        >
          Update selection
        </button>
      </form>
      {coverage ? <GapSummary coverage={coverage} /> : null}
      <StartCombinedRunForm
        name={`Combined ${context.season}`}
        scopeIds={selectedScopeIds}
        season={context.season}
      />
    </section>
  );
}
