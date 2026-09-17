import type { BaselineComparisonRow } from "@/services/raster/manualBaselines";

export function BaselineComparison({
  comparison,
}: {
  comparison: {
    counts: Record<BaselineComparisonRow["state"], number>;
    rows: BaselineComparisonRow[];
  };
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Manual baseline comparison
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {comparison.counts.unchanged} unchanged, {comparison.counts.changed}{" "}
          changed, {comparison.counts.new} new, {comparison.counts.missing}{" "}
          missing.
        </p>
      </div>
      {comparison.rows.map((row) => (
        <div
          className="grid gap-2 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem]"
          key={row.teamId}
        >
          <span className="font-medium">{row.teamLabel}</span>
          <span>Baseline {row.baselineRasterzahl ?? "—"}</span>
          <span>Result {row.resultRasterzahl ?? "—"}</span>
          <span>{row.state}</span>
        </div>
      ))}
    </section>
  );
}
