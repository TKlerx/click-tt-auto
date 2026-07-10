export type AssignmentRow = {
  id: string;
  league: string;
  group: string;
  clubName: string;
  team: string;
  rasterzahl: number;
  status: string;
  weekday: string;
  hall: string;
  startTime: string | null;
  weekSlot: string | null;
};

export function AssignmentTable({
  assignments,
  action = "",
}: {
  assignments: AssignmentRow[];
  action?: string;
}) {
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-2 sm:grid-cols-5">
        {["club", "league", "group", "team", "status"].map((name) => (
          <input
            key={name}
            className="rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            name={name}
            placeholder={name}
          />
        ))}
      </form>
      {assignments.length ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">League</th>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Club</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Raster</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Slot</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr
                  key={assignment.id}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="px-3 py-2">{assignment.league}</td>
                  <td className="px-3 py-2">{assignment.group}</td>
                  <td className="px-3 py-2">{assignment.clubName}</td>
                  <td className="px-3 py-2">{assignment.team}</td>
                  <td className="px-3 py-2 font-semibold">
                    {assignment.rasterzahl}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                      {assignment.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {assignment.weekday} {assignment.weekSlot ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
          No assignments.
        </p>
      )}
    </div>
  );
}
