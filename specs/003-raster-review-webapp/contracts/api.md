# API & Job Contracts

Next.js App Router route handlers under `webapp/src/app/api/raster/`. All routes require an authenticated session; the role gate (admin/scheduler/viewer) is noted per route (FR-025–029). All list routes accept `?district=` and stay district-scoped (FR-025). Request/response bodies validated with zod.

## Inputs

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/raster/input-sets` | admin | Create an InputSet (name, district) |
| GET | `/api/raster/input-sets?district=` | any | List input sets |
| POST | `/api/raster/input-sets/{id}/wishes/pdf` | admin | Upload wishes PDF → deterministic parse (FR-002); returns parsed Wishes marked `confidence` |
| GET | `/api/raster/input-sets/{id}/wishes/prompt` | admin | Get the ready-made LLM extraction prompt (embedded PDF text + JSON schema) — fallback (FR-002a) |
| POST | `/api/raster/input-sets/{id}/wishes/json` | admin | Submit pasted/structured wishes JSON → schema-validated (FR-002a/003); 422 on schema error |
| PUT | `/api/raster/input-sets/{id}/wishes/{wishId}` | admin | Review/correct a wish (FR-003) |
| POST | `/api/raster/input-sets/{id}/fixed-rasterzahlen` | admin | Add fixed upper-league Rasterzahlen (PDF/manual/structured) (FR-007) |
| POST | `/api/raster/input-sets/{id}/validate` | admin | Validate completeness/schema; returns errors or `ready` (FR-008) |

## Hall capacity

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/raster/capacity/upload` | admin, scheduler | CSV/Excel upload → upsert HallCapacity rows (FR-004) |
| GET | `/api/raster/capacity?district=&q=` | any | Search by club/hall/weekday (FR-006/ SC-008) |
| PUT | `/api/raster/capacity/{id}` | admin, scheduler | Edit capacity (last-write-wins, audited) (FR-005) |

Editing capacity marks dependent snapshots `stale=true` (FR-022).

## Runs & snapshots

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/raster/input-sets/{id}/runs` | admin | Start a generation run → enqueues `raster-run` job; 409 if InputSet not `ready` (FR-009) |
| GET | `/api/raster/runs/{id}` | any | Run status/outcome (FR-011) |
| POST | `/api/raster/runs/{id}/cancel` | admin | Cancel a pending/running job |
| GET | `/api/raster/snapshots?district=` | any | List snapshots (versions, FR-014) |
| GET | `/api/raster/snapshots/{id}` | any | Snapshot overview metrics + optimality + stale flag + objective breakdown, including ST4 same-club derby fallback count (FR-013/013a/015/022) |
| GET | `/api/raster/snapshots/{id}/conflicts?club=&weekday=&hall=&week=&minExcess=` | any | Conflict list, filtered (FR-016/017) |
| GET | `/api/raster/snapshots/{id}/conflicts/summary` | any | Per-club conflict summary (FR-018) |
| GET | `/api/raster/snapshots/{id}/assignments?club=&league=&group=&team=&status=` | any | Assignment view, filtered (FR-019/020/021) |
| POST | `/api/raster/snapshots/{id}/decisions` | admin, scheduler | Record ReviewDecision (FR-023) |
| POST | `/api/raster/snapshots/import` | admin | Import pre-computed external snapshot; 409/warn on identity/row-count mismatch (FR-031, later phase) |

Viewer role: all GET only; every POST/PUT above returns 403 for viewer (FR-028). Scheduler: 403 on run start, input upload, user mgmt (FR-027).

## Background job: `raster-run`

Handler in `webapp/worker/`. Input: `{ runId }`.

1. Load InputSet (wishes, capacities, fixed Rasterzahlen); build solver input files.
2. Spawn `uv run --python 3.12 scripts/solve-raster-cpsat.py --input <in> --output <out> --settings <json>` as a subprocess.
3. On exit: parse solver output; map CP-SAT status → `outcome` (`OPTIMAL`→`proven_optimal`, `FEASIBLE`→`feasible`, `INFEASIBLE`→`infeasible`, non-zero/timeout→`failed`/`cancelled`).
4. Run `src/raster/report` + `src/raster/score` to derive conflicts/assignments/metrics.
5. On success: create Snapshot (+ Assignment, Conflict rows), set optimality; write objectiveValue/objectiveBreakdown/solverStatus onto the run.
6. Update run status; emit audit + notification.

**Invariant**: the solver input encodes FixedRasterzahl as hard constraints and treats same-club derbies after Spieltag 4 as invalid; Spieltag 4 is allowed only as a high-penalty objective component. If the solver returns a fixed-Rasterzahl violation or Spieltag-5+ same-club derby, the job fails rather than persisting a bad snapshot.

## Solver I/O contract (worker ↔ Python)

- **Input**: JSON file — teams (with club, weekday, hall, requested/fixed Rasterzahl), hall capacities, rulebook/spielwochen config.
- **Output**: JSON file — per-team assigned Rasterzahl + status, solver status, objective value, objective breakdown.
- Exact schema pinned during implementation in `webapp/src/lib/raster/solver-io.ts` (zod) mirrored on the Python side.
</content>
