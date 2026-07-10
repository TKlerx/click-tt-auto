export type ConflictRow = {
  id: string;
  matchWeek: number;
  clubName: string;
  weekday: string;
  hall: string;
  capacity: number;
  actualCount: number;
  excess: number;
  teams: string;
};

export type PenaltyEventRow = {
  id: string;
  severity: "PENALTY" | "HARD";
  clubName: string;
  league: string;
  group: string;
  spieltag: number;
  teams: string[];
};

export function ConflictOverview({
  conflicts,
  penalties = [],
}: {
  conflicts: ConflictRow[];
  penalties?: PenaltyEventRow[];
}) {
  if (!conflicts.length && !penalties.length) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        No penalty conflicts.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      {penalties.map((penalty) => (
        <details
          key={penalty.id}
          className="border-b border-[var(--border)] px-4 py-3 last:border-b-0"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Spieltag {penalty.spieltag}: {penalty.clubName}, {penalty.league}{" "}
            {penalty.group}: {penalty.severity}
          </summary>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Same-club match after Spieltag 3: {penalty.teams.join(" / ")}
          </p>
        </details>
      ))}
      {conflicts.map((conflict) => (
        <details
          key={conflict.id}
          className="border-b border-[var(--border)] px-4 py-3 last:border-b-0"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Week {conflict.matchWeek}: {conflict.clubName}, {conflict.weekday},{" "}
            hall {conflict.hall}: {conflict.actualCount}/{conflict.capacity}
          </summary>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Excess {conflict.excess}: {conflict.teams}
          </p>
        </details>
      ))}
    </div>
  );
}
