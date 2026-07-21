import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { assertRasterAccess } from "@/lib/raster/access";
import {
  getSnapshot,
  listSnapshotAssignments,
  listSnapshotConflicts,
} from "@/services/raster";
import { AssignmentTable } from "@/components/raster/assignments/assignment-table";
import { IncompleteBadge } from "@/components/raster/coverage/incomplete-badge";
import { CoverageDetail } from "@/components/raster/coverage/coverage-detail";
import { CombinedBadge } from "@/components/raster/coverage/combined-badge";

export default async function RasterSnapshotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ scope?: string }>;
}) {
  const user = await requireSession();
  const snapshot = await getSnapshot((await params).id);
  if (!snapshot) notFound();

  const access = await assertRasterAccess(user, snapshot.scope.code, "viewer");
  if (access !== true) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        You are not authorized to view this snapshot.
      </div>
    );
  }

  const coveredScopes = snapshot.spannedScopes.length
    ? snapshot.spannedScopes.map((row) => row.scope.code)
    : [snapshot.scope.code];
  const scopeRows = snapshot.spannedScopes.length
    ? snapshot.spannedScopes
    : [{ scopeId: snapshot.scopeId, scope: snapshot.scope }];
  const requestedScope = (await searchParams)?.scope;
  const selectedScopeId = scopeRows.some(
    (row) => row.scopeId === requestedScope,
  )
    ? requestedScope
    : null;
  const combined = coveredScopes.length > 1;
  const [assignments, conflicts] = await Promise.all([
    listSnapshotAssignments(snapshot.id, { scopeId: selectedScopeId }),
    listSnapshotConflicts(snapshot.id, { scopeId: selectedScopeId }),
  ]);
  const topClubs = summarizeConflictClubs(conflicts);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {coveredScopes.join(", ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CombinedBadge combined={combined} />
          <IncompleteBadge complete={snapshot.run?.coverageComplete} />
        </div>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Raster results
        </h1>
        {combined ? (
          <form className="mt-4 flex flex-wrap items-center gap-2" method="get">
            <label className="text-sm font-medium">
              Scope
              <select
                className="ml-2 h-9 rounded-md border border-[var(--border)] bg-transparent px-2"
                defaultValue={selectedScopeId ?? ""}
                name="scope"
              >
                <option value="">All</option>
                {scopeRows.map((row) => (
                  <option key={row.scopeId} value={row.scopeId}>
                    {row.scope.code}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              type="submit"
            >
              Apply
            </button>
          </form>
        ) : null}
      </section>

      <CoverageDetail coverageJson={snapshot.run?.coverageJson} />

      <section className="grid gap-3 md:grid-cols-4">
        <Metric
          label="Optimality"
          value={displaySnapshotOptimality(
            snapshot.optimality,
            snapshot.run?.settings,
          )}
        />
        <Metric label="Conflicts" value={snapshot.totalConflicts} />
        <Metric label="Total excess" value={snapshot.totalExcess} />
        <Metric label="Max slot excess" value={snapshot.maxExcess} />
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
              className="grid gap-3 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(12rem,1fr)_5rem_8rem_10rem]"
              key={club.clubId}
            >
              <span className="font-medium">{club.clubName}</span>
              <span>{club.rows} rows</span>
              <span>{club.optimizerExcess} optimizer excess</span>
              <span>{club.preExistingExcess} pre-existing fixed excess</span>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No conflict summary.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Worst gym slots
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Top 10 concrete gym/day/week slots by excess.
          </p>
        </div>
        {conflicts.length ? (
          conflicts.slice(0, 10).map((conflict) => {
            const teams = parseConflictTeams(conflict.teams);
            return (
              <div
                className="grid gap-3 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0"
                key={conflict.id}
              >
                <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_5rem_7rem_6rem_6rem_6rem]">
                  <span className="font-medium">{conflict.clubName}</span>
                  <span>W{conflict.matchWeek}</span>
                  <span>{conflict.weekday}</span>
                  <span>Gym {conflict.hall}</span>
                  <span>cap {conflict.capacity}</span>
                  <span>
                    peak {conflict.actualCount}, +{conflict.excess}
                  </span>
                </div>
                {isImportedFixedConflict(teams) ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Pre-existing upper-league clash: all teams are imported
                    fixed Rasterzahlen, not optimizer choices.
                  </p>
                ) : null}
                <ul className="grid gap-1 text-sm text-[var(--muted-foreground)] md:grid-cols-2">
                  {teams.map((team, index) => (
                    <li key={`${conflict.id}-${index}`}>
                      <ConflictTeamLine team={team} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No gym slot excesses.
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
              <span className="grid gap-1">
                {parseConflictTeams(conflict.teams).map((team, index) => (
                  <ConflictTeamLine
                    key={`${conflict.id}-full-${index}`}
                    team={team}
                  />
                ))}
              </span>
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

type ConflictTeam = {
  id: string;
  league?: string;
  group?: string;
  label?: string;
  assignedRasterzahl?: number;
  requestedRasterzahl?: number[];
  assignmentStatus?: string;
  planned?: boolean;
  weekSlot?: string;
  startTime?: string;
  durationMinutes?: number;
};

function ConflictTeamLine({ team }: { team: ConflictTeam }) {
  return (
    <span>
      {team.label ?? team.id}
      {team.assignedRasterzahl ? `, RZ ${team.assignedRasterzahl}` : ""}
      {team.requestedRasterzahl?.length
        ? `, wished RZ ${team.requestedRasterzahl.join("/")}`
        : ", no RZ wish"}
      {team.assignmentStatus ? `, ${team.assignmentStatus.toLowerCase()}` : ""}
      {team.weekSlot ? `, W${team.weekSlot}` : ", no week wish"}
      {team.startTime ? `, ${team.startTime}` : ", time unknown"}
      {team.durationMinutes ? ` (${team.durationMinutes} min)` : ""}
      {team.league || team.group
        ? `, ${[team.league, team.group].filter(Boolean).join(" / ")}`
        : ""}
    </span>
  );
}

function parseConflictTeams(value: string): ConflictTeam[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((team) => {
        if (team && typeof team === "object") {
          const row = team as Record<string, unknown>;
          return {
            id: String(row.id ?? row.label ?? ""),
            league: row.league ? String(row.league) : undefined,
            group: row.group ? String(row.group) : undefined,
            label: row.label ? String(row.label) : undefined,
            assignedRasterzahl:
              typeof row.assignedRasterzahl === "number"
                ? row.assignedRasterzahl
                : undefined,
            requestedRasterzahl: Array.isArray(row.requestedRasterzahl)
              ? row.requestedRasterzahl
                  .map((value) => Number(value))
                  .filter(Number.isInteger)
              : undefined,
            assignmentStatus: row.assignmentStatus
              ? String(row.assignmentStatus)
              : undefined,
            planned:
              typeof row.planned === "boolean" ? row.planned : undefined,
            weekSlot: row.weekSlot ? String(row.weekSlot) : undefined,
            startTime: row.startTime ? String(row.startTime) : undefined,
            durationMinutes:
              typeof row.durationMinutes === "number"
                ? row.durationMinutes
                : undefined,
          };
        }
        return { id: String(team) };
      });
    }
  } catch {
    // Stored imports may contain plain text.
  }
  return value
    .split(/\r?\n|,\s*/)
    .map((team) => team.trim())
    .filter(Boolean)
    .map((id) => ({ id }));
}

function isImportedFixedConflict(teams: ConflictTeam[]) {
  return (
    teams.length > 0 &&
    teams.every(
      (team) =>
        team.assignmentStatus?.toLowerCase() === "fixed" &&
        (team.planned === false || isUpperLeague(team.league)),
    )
  );
}

function isUpperLeague(league?: string) {
  return /\b(?:verbandsliga|landesliga|oberliga|nrw-liga)\b/i.test(
    league ?? "",
  );
}

function displaySnapshotOptimality(optimality: string, settings?: string | null) {
  if (optimality !== "PROVEN_OPTIMAL") return optimality;
  try {
    const parsed = JSON.parse(settings ?? "{}") as { strategy?: unknown };
    return parsed.strategy === "initial_heuristic" ? "FEASIBLE" : optimality;
  } catch {
    return optimality;
  }
}

function summarizeConflictClubs(
  conflicts: Array<{
    clubId: string;
    clubName: string;
    excess: number;
    teams: string;
  }>,
) {
  const byClub = new Map<
    string,
    {
      clubId: string;
      clubName: string;
      rows: number;
      optimizerExcess: number;
      preExistingExcess: number;
    }
  >();

  for (const conflict of conflicts) {
    const current = byClub.get(conflict.clubId) ?? {
      clubId: conflict.clubId,
      clubName: conflict.clubName,
      rows: 0,
      optimizerExcess: 0,
      preExistingExcess: 0,
    };
    current.rows += 1;
    if (isImportedFixedConflict(parseConflictTeams(conflict.teams))) {
      current.preExistingExcess += conflict.excess;
    } else {
      current.optimizerExcess += conflict.excess;
    }
    byClub.set(conflict.clubId, current);
  }

  return [...byClub.values()].sort(
    (left, right) =>
      right.optimizerExcess +
      right.preExistingExcess -
      (left.optimizerExcess + left.preExistingExcess),
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
