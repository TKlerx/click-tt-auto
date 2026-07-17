import type { CoverageRecord } from "@/lib/raster/coverage";

export function CoverageDetail({
  coverageJson,
}: {
  coverageJson?: string | null;
}) {
  const coverage = parseCoverage(coverageJson);
  if (!coverage || coverage.complete) return null;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Coverage gaps
      </h2>
      <div className="mt-3 grid gap-2 text-sm">
        <p>
          Scopes: {coverage.spannedScopes.join(", ")}
          {coverage.spannedAll ? "" : " (subset)"}
        </p>
        {coverage.scopesWithoutInputSet?.length ? (
          <p>
            Scopes with no inputs at all:{" "}
            {coverage.scopesWithoutInputSet.join(", ")}
          </p>
        ) : null}
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
        {coverage.unresolvedWishConflicts?.count ? (
          <p>
            Unresolved wish conflicts:{" "}
            {coverage.unresolvedWishConflicts.conflicts
              .map((conflict) => conflict.id)
              .join(", ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function parseCoverage(value?: string | null): CoverageRecord | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as CoverageRecord;
  } catch {
    return null;
  }
}
