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
| PUT | `/api/raster/input-sets/{id}/groups/{groupId}` | admin | Review/correct group metadata, including six-team normal 6er vs 6er Doppelrunde mode (FR-008a) |
| POST | `/api/raster/input-sets/{id}/validate` | admin | Validate completeness/schema; returns errors or `ready` (FR-008) |

## Source hierarchy and caches

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/raster/sources?district=&sourceType=` | any | List source documents/links/caches visible to a district, including ancestor scope sources (e.g. OWL + WTTV + DE) |
| POST | `/api/raster/sources` | admin | Register or update a source for a scope (`scopeCode`, `sourceType`, `sourceRef`, `displayName`, optional `contentHash`, optional `parsedJson`) |
| POST | `/api/raster/sources/upload` | admin | Upload a replacement source file for a scope and register it as a `RasterSource`. For `GROUP_ASSIGNMENT`, this is the **manual click-TT fallback** (used when live fetch fails/unavailable); the payload is schema-validated before caching (FR-008e-1) |
| POST | `/api/raster/sources/{id}/refresh` | admin | Explicitly parse/refresh a stored source cache. For `GROUP_ASSIGNMENT` this performs the **live click-TT fetch/parse** (primary path, FR-008e-1); also supports `WISHES_PDF` |

Source records belong to the hierarchy level where the source is valid. For example, a WTTV-wide group PDF is stored under WTTV and inherited by OWL flows. Registering a source does not reparse it; parse/cache refresh happens only when explicitly requested by a parser/upload flow. The app never contacts click-TT without an explicit refresh/upload action.

## Club identity resolution

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/raster/clubs?district=&q=` | any | List/search canonical `Club` entities for a scope |
| POST | `/api/raster/clubs/resolve` | admin | Resolve a batch of source club names against the scope's canonical clubs. Exact name/alias matches auto-resolve; each non-exact name returns the closest canonical `Club` by string similarity as a proposal (FR-008f) |
| POST | `/api/raster/clubs/aliases` | admin | Confirm a resolution: persist a `ClubAlias` (`scopeCode`, `sourceName`, target `clubId` or new `canonicalName`) so the mapping is reused on later ingests (FR-008f) |

Ingest flows (wishes/capacity/assignments) call resolution before persisting rows; unresolved non-exact names block the review step until an admin confirms a mapping.

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
| POST | `/api/raster/input-sets/{id}/runs` | admin | Start a generation run → enqueues `raster-run` job; 409 if InputSet not `ready` (FR-009). Optional body `{ timeLimitSeconds }` lets an admin override the default 30-min run limit (FR-010a) |
| GET | `/api/raster/runs/{id}` | any | Run status/outcome (FR-011) |
| POST | `/api/raster/runs/{id}/cancel` | admin | Cancel a pending/running job |
| GET | `/api/raster/snapshots?district=&season=` | any | List snapshots (versions, FR-014); optional `season` scopes review to a district+season (FR-014b) |
| GET | `/api/raster/snapshots/{id}` | any | Snapshot overview metrics + optimality + stale flag + objective breakdown, including ST4 same-club derby fallback count (FR-013/013a/015/022) |
| GET | `/api/raster/snapshots/{id}/conflicts?club=&weekday=&hall=&week=&minExcess=` | any | Conflict list, filtered (FR-016/017) |
| GET | `/api/raster/snapshots/{id}/conflicts/summary` | any | Per-club conflict summary (FR-018) |
| GET | `/api/raster/snapshots/{id}/assignments?club=&league=&group=&team=&status=` | any | Assignment view, filtered (FR-019/020/021) |
| POST | `/api/raster/snapshots/{id}/decisions` | admin, scheduler | Record ReviewDecision (FR-023) |
| POST | `/api/raster/snapshots/import` | admin | Import pre-computed external snapshot; 409/warn on identity/row-count mismatch (FR-031, later phase) |
| DELETE | `/api/raster/snapshots/{id}` | admin | Delete a snapshot (indefinite retention otherwise, FR-014a). If it is the newest for its `(district, season)`, require `?confirmLatest=true`; without it, return 409 with a warning payload so the UI can confirm |

Viewer role: all GET only; every POST/PUT above returns 403 for viewer (FR-028). Scheduler: 403 on run start, input upload, user mgmt (FR-027).

## Background job: `raster-run`

Handler in `webapp/worker/`. Input: `{ runId }`.

1. Load InputSet (wishes, capacities, fixed Rasterzahlen, reviewed group modes); build solver input files.
2. Spawn `uv run --python 3.12 scripts/solve-raster-cpsat.py --input <in> --output <out> --settings <json>` as a subprocess.
3. On exit: parse solver output; map CP-SAT status → `outcome` (`OPTIMAL`→`proven_optimal`, `FEASIBLE`→`feasible`, `INFEASIBLE`→`infeasible`, non-zero/timeout→`failed`/`cancelled`).
4. Run `src/raster/report` + `src/raster/score` to derive conflicts/assignments/metrics.
5. On success: create Snapshot (+ Assignment, Conflict rows), set optimality; write objectiveValue/objectiveBreakdown/solverStatus onto the run.
6. Update run status; emit audit + notification.

**Invariant**: the solver input encodes FixedRasterzahl as hard constraints and treats same-club derbies after Spieltag 4 as invalid; Spieltag 4 is allowed only as a high-penalty objective component. If the solver returns a fixed-Rasterzahl violation or Spieltag-5+ same-club derby, the job fails rather than persisting a bad snapshot.

## Solver I/O contract (worker ↔ Python)

- **Input**: JSON file — teams (with resolved canonical club, weekday, hall, requested/fixed Rasterzahl), groups (including reviewed `rasterMode` for 6er Doppelrunde), hall capacities, rulebook/spielwochen config. The `--settings` payload carries `timeLimitSeconds` (default 1800, admin-overridable) which the solver applies as its stop limit (FR-010a).
- **Output**: JSON file — per-team assigned Rasterzahl + status, solver status, objective value, objective breakdown.
- Exact schema pinned during implementation in `webapp/src/lib/raster/solver-io.ts` (zod) mirrored on the Python side.
</content>
