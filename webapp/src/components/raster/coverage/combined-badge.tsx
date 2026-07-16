export function CombinedBadge({ combined }: { combined: boolean }) {
  if (!combined) return null;
  return (
    <span className="rounded-sm border border-[var(--border)] px-2 py-1 text-xs font-medium">
      Combined
    </span>
  );
}
