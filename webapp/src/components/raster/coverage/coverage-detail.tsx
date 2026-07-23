import type { CoverageRecord } from "@/lib/raster/coverage";

export function CoverageDetail({
  coverageJson,
}: {
  coverageJson?: string | null;
}) {
  const coverage = parseCoverage(coverageJson);
  if (!coverage || coverage.complete) return null;
  const gapCount =
    coverage.scopesWithoutInputSet.length +
    coverage.excludedGroups.length +
    coverage.wishGaps.length +
    coverage.capacityGaps.length +
    (coverage.unresolvedWishConflicts?.count ?? 0) +
    (coverage.upperLeague.importPresent ? 0 : 1) +
    coverage.upperLeague.unmatched.length +
    coverage.upperLeague.excludedNoHall.length +
    coverage.upperLeague.invalidRasterzahl.length;

  return (
    <details className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Coverage gaps ({gapCount})
      </summary>
      <div className="mt-3 grid gap-4 text-sm">
        <p className="text-[var(--muted-foreground)]">
          Scopes: {coverage.spannedScopes.join(", ")}
          {coverage.spannedAll ? "" : " (subset)"}
        </p>
        <ListSection
          items={coverage.scopesWithoutInputSet}
          title="Scopes with no inputs"
        />
        <ListSection items={coverage.excludedGroups} title="Excluded groups" />
        <ListSection
          items={coverage.wishGaps.map(
            (gap) => `${gap.teamId} (${gap.missing.join(", ")})`,
          )}
          title="Wish gaps"
        />
        <ListSection
          items={coverage.capacityGaps.map(
            (gap) => `${gap.clubId}/${gap.hall}/${gap.weekday} ${gap.status}`,
          )}
          title="Capacity gaps"
        />
        <ListSection
          items={
            coverage.unresolvedWishConflicts?.conflicts.map(
              (conflict) => conflict.id,
            ) ?? []
          }
          title="Unresolved wish conflicts"
        />
        {coverage.upperLeague.importPresent === false ? (
          <p>Upper-league raster import missing.</p>
        ) : null}
        <ListSection
          items={coverage.upperLeague.unmatched.map(
            (row) => `${row.clubId}/${row.label}`,
          )}
          title="Upper-league unmatched"
        />
        <ListSection
          items={coverage.upperLeague.excludedNoHall.map(
            (row) => `${row.clubId}/${row.label}`,
          )}
          title="Upper-league missing hall/day"
        />
        <ListSection
          items={coverage.upperLeague.invalidRasterzahl.map(
            (row) =>
              `${row.clubId}/${row.label}: ${row.rasterzahl} for ${row.size}`,
          )}
          title="Upper-league invalid Rasterzahl"
        />
      </div>
    </details>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="font-semibold">
        {title} ({items.length})
      </h3>
      <ul className="mt-2 grid max-h-64 gap-1 overflow-auto rounded-md border border-[var(--border)] p-3 text-[var(--muted-foreground)]">
        {items.map((item) => (
          <li className="break-words" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function parseCoverage(value?: string | null): CoverageRecord | null {
  if (!value) return null;
  try {
    const coverage = JSON.parse(value) as Partial<CoverageRecord>;
    return {
      complete: Boolean(coverage.complete),
      spannedScopes: coverage.spannedScopes ?? [],
      spannedAll: Boolean(coverage.spannedAll),
      scopesWithoutInputSet: coverage.scopesWithoutInputSet ?? [],
      excludedGroups: coverage.excludedGroups ?? [],
      wishGaps: coverage.wishGaps ?? [],
      capacityGaps: coverage.capacityGaps ?? [],
      unresolvedWishConflicts: coverage.unresolvedWishConflicts,
      upperLeague: {
        importPresent: coverage.upperLeague?.importPresent ?? true,
        matched: coverage.upperLeague?.matched ?? [],
        unmatched: coverage.upperLeague?.unmatched ?? [],
        excludedNoHall: coverage.upperLeague?.excludedNoHall ?? [],
        invalidRasterzahl: coverage.upperLeague?.invalidRasterzahl ?? [],
      },
    };
  } catch {
    return null;
  }
}
