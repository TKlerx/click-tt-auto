import type { CoverageRecord } from "@/lib/raster/coverage";

export function GapSummary({ coverage }: { coverage: CoverageRecord }) {
  const gapCount =
    coverage.excludedGroups.length +
    coverage.wishGaps.length +
    coverage.capacityGaps.length;

  return (
    <div className="grid gap-3 rounded-md border border-[var(--border)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Gaps before start</h2>
        <span className="rounded-sm border border-[var(--border)] px-2 py-1 text-xs">
          {coverage.spannedAll ? "All scopes" : "Subset"} /{" "}
          {gapCount === 0 ? "No gaps" : `${gapCount} gap(s)`}
        </span>
      </div>
      {gapCount === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          The selected scopes have no recorded gaps.
        </p>
      ) : (
        <div className="grid gap-2">
          {coverage.excludedGroups.length ? (
            <p>Excluded groups: {coverage.excludedGroups.join(", ")}</p>
          ) : null}
          {coverage.wishGaps.length ? (
            <p>
              Wish gaps:{" "}
              {coverage.wishGaps
                .map((gap) => `${gap.teamId} (${gap.missing.join(", ")})`)
                .join("; ")}
            </p>
          ) : null}
          {coverage.capacityGaps.length ? (
            <p>
              Capacity gaps:{" "}
              {coverage.capacityGaps
                .map(
                  (gap) =>
                    `${gap.clubId}/${gap.hall}/${gap.weekday} ${gap.status}`,
                )
                .join("; ")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
