export function IncompleteBadge({
  complete,
}: {
  complete?: boolean | null;
}) {
  if (complete !== false) return null;
  return (
    <span className="rounded-sm border border-amber-500/50 px-2 py-1 text-xs font-medium text-amber-300">
      Incomplete
    </span>
  );
}
