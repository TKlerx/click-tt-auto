export function SnapshotOptimalityBadge({
  optimality,
}: {
  optimality: string | null | undefined;
}) {
  if (!optimality) return null;
  return (
    <span className="rounded border border-[var(--border)] px-2 py-1 text-xs font-semibold">
      {optimality}
    </span>
  );
}

export function ObjectiveBreakdown({
  breakdown,
}: {
  breakdown: string | null | undefined;
}) {
  const parsed = safeParseBreakdown(breakdown);
  const entries = Object.entries(parsed);

  if (!entries.length) return null;
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="rounded-lg border border-[var(--border)] px-3 py-2"
        >
          <dt className="text-xs text-[var(--muted-foreground)]">{key}</dt>
          <dd className="font-semibold">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function safeParseBreakdown(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
