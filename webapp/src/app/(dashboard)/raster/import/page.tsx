import { Role } from "../../../../../generated/prisma/enums";
import { CreateInputSetForm } from "@/components/raster/input-set-actions";
import { RasterSourcesPanel } from "@/components/raster/sources/raster-sources-panel";
import { listInputSets, listRasterSourcesForScope } from "@/services/raster";
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
  const canEdit = context.user.role === Role.PLATFORM_ADMIN;

  return (
    <div className="space-y-4">
      <RasterSourcesPanel
        canEdit={canEdit}
        scopeCode={context.scope.code}
        inputSet={inputSets[0] ?? null}
        season={context.season}
        scopes={context.scopes}
        sources={sources}
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
        {inputSets.length ? (
          <div className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{inputSets[0].name}</span>
            <span>{inputSets[0].status}</span>
            <span>{inputSets[0]._count.wishes} wishes</span>
            <span>{inputSets[0]._count.runs} runs</span>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No input set for this scope and season yet.
          </p>
        )}
      </section>
    </div>
  );
}
