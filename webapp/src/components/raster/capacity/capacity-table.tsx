export type CapacityRow = {
  id: string;
  clubId: string;
  hall: string;
  weekday: string;
  capacity: number;
  basis: string;
};

export function CapacityTable({ rows }: { rows: CapacityRow[] }) {
  if (!rows.length) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        No capacity rows.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2">Club</th>
            <th className="px-3 py-2">Hall</th>
            <th className="px-3 py-2">Day</th>
            <th className="px-3 py-2">Capacity</th>
            <th className="px-3 py-2">Basis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[var(--border)] last:border-b-0"
            >
              <td className="px-3 py-2">{row.clubId}</td>
              <td className="px-3 py-2">{row.hall}</td>
              <td className="px-3 py-2">{row.weekday}</td>
              <td className="px-3 py-2 font-semibold">{row.capacity}</td>
              <td className="px-3 py-2">
                <span className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                  {row.basis}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
