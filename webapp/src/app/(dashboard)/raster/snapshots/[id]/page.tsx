import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { assertRasterAccess } from "@/lib/raster/access";
import {
  getSnapshot,
  listSnapshotAssignments,
  listSnapshotConflicts,
  summarizeSnapshotConflicts,
} from "@/services/raster";
import { AssignmentTable } from "@/components/raster/assignments/assignment-table";

export default async function RasterSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSession();
  const snapshot = await getSnapshot((await params).id);
  if (!snapshot) notFound();

  const access = await assertRasterAccess(user, snapshot.district, "viewer");
  if (access !== true) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        You are not authorized to view this snapshot.
      </div>
    );
  }

  const [assignments, conflicts, topClubs] = await Promise.all([
    listSnapshotAssignments(snapshot.id),
    listSnapshotConflicts(snapshot.id),
    summarizeSnapshotConflicts(snapshot.id),
  ]);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {snapshot.district}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Raster results
        </h1>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Optimality" value={snapshot.optimality} />
        <Metric label="Conflicts" value={snapshot.totalConflicts} />
        <Metric label="Total excess" value={snapshot.totalExcess} />
        <Metric label="Max excess" value={snapshot.maxExcess} />
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Top clubs
          </h2>
        </div>
        {topClubs.length ? (
          topClubs.slice(0, 10).map((club) => (
            <div
              className="grid grid-cols-[minmax(12rem,1fr)_6rem_6rem] gap-3 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0"
              key={club.clubId}
            >
              <span className="font-medium">{club.clubName}</span>
              <span>{club.rows} rows</span>
              <span>{club.excess} excess</span>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No conflict summary.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Assignments
        </h2>
        <AssignmentTable
          assignments={assignments.map((assignment) => ({
            id: assignment.id,
            league: assignment.league,
            group: assignment.group,
            clubName: assignment.clubName,
            team: assignment.team,
            rasterzahl: assignment.rasterzahl,
            status: assignment.status,
            weekday: assignment.weekday,
            hall: assignment.hall,
            startTime: assignment.startTime,
            weekSlot: assignment.weekSlot,
          }))}
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Conflicts
          </h2>
        </div>
        {conflicts.length ? (
          conflicts.map((conflict) => (
            <div
              className="grid gap-2 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(10rem,1fr)_5rem_7rem_5rem_minmax(10rem,1fr)]"
              key={conflict.id}
            >
              <span className="font-medium">{conflict.clubName}</span>
              <span>W{conflict.matchWeek}</span>
              <span>{conflict.weekday}</span>
              <span>+{conflict.excess}</span>
              <span>{conflict.teams}</span>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No conflicts.
          </p>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
