import { ScenarioComparison } from "@/components/raster/scenario-comparison";
import { listInputSets, listScenarios } from "@/services/raster";
import {
  RasterStepError,
  type RasterStepSearchParams,
  requireRasterStep,
} from "../_lib/step-context";

export default async function RasterRunsPage({
  searchParams,
}: {
  searchParams: RasterStepSearchParams;
}) {
  const context = await requireRasterStep(searchParams);
  if ("error" in context) return <RasterStepError message={context.error} />;

  const [inputSets, scenarios] = await Promise.all([
    listInputSets(context.scope.id, context.season),
    listScenarios({ scopeId: context.scope.id, season: context.season }),
  ]);
  const inputSet = inputSets[0] ?? null;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Optimization runs
      </h1>
      {inputSet ? (
        <ScenarioComparison
          scenarios={scenarios.filter(
            (scenario) => scenario.inputSetId === inputSet.id,
          )}
        />
      ) : null}
      {!inputSet || !scenarios.length ? (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          No optimization runs for this scope and season yet.
        </p>
      ) : null}
    </section>
  );
}
