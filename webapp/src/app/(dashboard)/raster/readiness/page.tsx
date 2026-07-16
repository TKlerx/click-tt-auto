import { buildReadinessAcrossScopes } from "@/lib/raster/readiness-across-scopes";
import {
  RasterStepError,
  type RasterStepSearchParams,
  requireRasterStep,
} from "../_lib/step-context";

export default async function RasterReadinessPage({
  searchParams,
}: {
  searchParams: RasterStepSearchParams;
}) {
  const context = await requireRasterStep(searchParams);
  if ("error" in context) return <RasterStepError message={context.error} />;

  const rows = await buildReadinessAcrossScopes(context.user, context.season);

  return (
    <section className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Readiness overview
      </h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <tr>
              <th className="py-2 pr-4">Scope</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Missing items</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--border)]"
                key={row.scope.id}
              >
                <td className="py-3 pr-4 font-medium">{row.scope.name}</td>
                <td className="py-3 pr-4">
                  {row.complete ? "Complete" : "Incomplete"}
                </td>
                <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                  {row.missing.length ? row.missing.join("; ") : "None"}
                </td>
                <td className="py-3 pr-4">
                  {row.complete ? null : (
                    <a
                      className="text-[var(--primary)]"
                      href={`/raster/${row.resolvedBy}?scope=${encodeURIComponent(
                        row.scope.code,
                      )}&season=${encodeURIComponent(context.season)}`}
                    >
                      Open
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
