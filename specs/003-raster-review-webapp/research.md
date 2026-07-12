# Research: Raster Generation & Review Webapp

## Decision: Build inside the existing webapp-template baseline

**Decision**: Implement the feature inside the already-scaffolded `webapp/` (Next.js 16, React 19, Prisma 7, better-auth, next-intl, Tailwind/shadcn) rather than starting a new app.
**Rationale**: The baseline already provides auth, roles, users, audit, notifications, i18n, a background-job system, and Docker packaging — exactly the cross-cutting concerns FR-025–030 need. Reusing it removes most non-feature work.
**Alternatives considered**:
- New standalone app — rejected, would reimplement auth/roles/jobs/audit.
- Extend the root CLI toolkit only — rejected, cannot serve multiple non-technical users with role-gated review UI.

## Decision: Reuse the existing Rasterzahl pipeline; do not rebuild the optimizer

**Decision**: Treat repo-root `src/raster/*` (ingest, optimize, report, score, rulebook) and `scripts/solve-raster-cpsat.py` (Python OR-Tools CP-SAT) as the generation engine. The webapp orchestrates them; it does not reimplement solving.
**Rationale**: The pipeline and an exact CP-SAT solver already exist and produce the assignment/conflict/score outputs the review layer needs. CP-SAT distinguishes proven-optimal vs feasible-only (FR-011/013).
**Alternatives considered**:
- Port CP-SAT to TypeScript — rejected, high risk, no equivalent TS solver, redundant.
- Heuristic-only (TS `optimize/`) — kept as a fast path, but CP-SAT is needed for proof of optimality.

## Decision: Optimizer runs as an async background job

**Decision**: Run generation via the baseline's background-job system (migration `background_jobs` + `worker/`). A `raster-run` job handler builds the solver input from the reviewed InputSet, spawns the Python CP-SAT solver as a subprocess (`uv run --python 3.12 scripts/solve-raster-cpsat.py`), then ingests the output into a Snapshot.
**Rationale**: Satisfies FR-010 (async, non-blocking review). Reuses existing job infra (retries, status) and the existing `Dockerfile.worker`.
**Alternatives considered**:
- In-request synchronous solve — rejected, blocks and times out.
- External solver service/API — rejected, unnecessary; solver runs locally in the worker container.

## Decision: Wishes PDF parsing is deterministic in-app; LLM is an optional user-side fallback

**Decision**: Primary path = existing deterministic parser `src/raster/ingest/wishes-pdf.ts` (pdfjs-dist text extraction + fixed-layout patterns), producing clubs/teams marked `confidence: "review"`. Fallback = the app emits a ready-made prompt embedding the extracted PDF text + expected JSON schema; the user runs it in their own LLM and pastes JSON back for schema validation. The app runs no LLM.
**Rationale**: The wishes PDFs share a fixed layout, so deterministic parsing is reliable and free; matches Principle II (flag uncertainty for review). Avoids a server-side LLM dependency and its privacy/cost.
**Alternatives considered**:
- Server-side LLM extraction — rejected (cost, privacy, dependency) per user.
- LLM-only — rejected; deterministic parser already works for the known layout.

## Decision: Persistence model separates inputs, runs, and snapshots

**Decision**: Model InputSet (+ Wish, HallCapacity, FixedRasterzahl) separately from OptimizationRun and Snapshot (+ Assignment, Conflict). Reviewed capacity/inputs persist independently of snapshots so historical snapshots stay interpretable (FR-014), and edits mark dependent snapshots stale (FR-022).
**Rationale**: Directly supports versioned review, staleness, and audit. Aligns with the spec's Key Entities.
**Alternatives considered**:
- Embed inputs inside each snapshot — rejected, loses editability and cross-snapshot capacity reuse.

## Decision: District scoping for scale

**Decision**: All review queries are scoped/filterable by district; indexes on (district, club) etc. Views stay at hundreds of rows even if the store later holds county-wide data (~1,400 clubs/teams).
**Rationale**: FR-025 + clarified scale. Keeps UI simple (no virtualization) while not precluding growth.
**Alternatives considered**:
- Global unscoped tables + client virtualization — rejected as premature complexity for the first release.

## Decision: Capacity concurrency = last-write-wins

**Decision**: No locking on capacity edits; last write wins, audit trail records each change.
**Rationale**: Few users edit capacity ~annually (clarified). Locking/merge is unjustified complexity.
**Alternatives considered**:
- Optimistic locking / merge UI — rejected as over-engineering for the usage pattern.

## Decision: Canonical Club identity with fuzzy-assisted alias mapping

**Decision**: Maintain a canonical `Club` per scope plus a persisted `ClubAlias` (sourceName → clubId) table. At ingest, exact name/alias matches resolve automatically; only non-exact names trigger a review step that proposes the closest canonical club by string similarity, and the confirmed mapping is saved for reuse (clarified 2026-07-12, FR-008f).
**Rationale**: Club names differ across wishes, capacity, and assignment sources; a canonical entity keeps last-write-wins capacity, wishes, and assignments reliably joined. Auto-resolving exact matches avoids needless review prompts.
**Alternatives considered**:
- Re-fuzzy-match every ingest with no persisted aliases — rejected: repeats work and re-asks the user each run.
- Exact-string-only with a blocking error on any mismatch — rejected: pushes avoidable data-cleanup back onto the user for benign spelling differences.
**Implementation note**: string-similarity ranking can use a small pure-JS routine (e.g. normalized Levenshtein / token overlap); no heavyweight dependency required.

## Decision: click-TT group data via explicit live fetch, manual upload as fallback

**Decision**: Obtain click-TT group/roster data through two explicit-action paths — a live fetch/parse on `sources/{id}/refresh` (primary) and a schema-validated manual export upload on `sources/upload` (fallback when live fetch fails/unavailable). The app never contacts click-TT without an explicit user action (clarified 2026-07-12, FR-008e-1).
**Rationale**: Matches the existing FR-008e cache rule (refresh only on explicit request) and keeps the app read-only toward click-TT (Principle II). The manual path guarantees the flow still works when the live fetch breaks (layout/auth drift).
**Alternatives considered**:
- Live fetch only — rejected: a single point of failure when click-TT changes.
- Manual upload only — rejected: loses the low-effort primary path the FR-008e wording already implies.

## Decision: Optimizer run time limit — 30 min default, admin-overridable

**Decision**: Enforce a run time limit carried in `OptimizationRun.settings.timeLimitSeconds`, defaulting from an app setting (1800s / 30 min) and overridable per run by admins; reaching it without proof yields the `feasible` outcome (clarified 2026-07-12, FR-010a). Resolves the previously vague "configured limit."
**Rationale**: District scale (~100–1,000 assignments) usually proves or strongly approximates well under 30 min; the ceiling bounds worker occupancy while the override covers a rare hard district.
**Alternatives considered**:
- Hard-coded fixed limit — rejected: no escape hatch for a hard district.
- No app-level limit, rely on solver defaults only — rejected: unbounded worker occupancy, unpredictable UX.

## Decision: German-only UI on next-intl scaffolding

**Decision**: Ship a German-only UI for the first release, built on the baseline's `next-intl` with externalized strings; domain terms (Rasterzahl, Spieltag, Doppelrunde) stay German (clarified 2026-07-12).
**Rationale**: Audience is a German association; externalized strings keep later locales cheap without double-authoring now.
**Alternatives considered**: bilingual from day one — rejected as unneeded first-release cost.

## Decision: Indefinite snapshot retention with a latest-delete guard

**Decision**: Retain snapshots indefinitely (no auto-pruning); admins may delete, but deleting the newest snapshot for a `(district, season)` requires an explicit confirmation (409 without `confirmLatest`), while superseded snapshots delete freely (clarified 2026-07-12, FR-014a). Adds a `season` key to InputSet/Snapshot.
**Rationale**: Snapshots are the historical record; run volume is low, so manual delete suffices. The guard prevents accidentally destroying the current authoritative result.
**Alternatives considered**:
- Auto-prune last-N / time-based — rejected: risks discarding still-relevant history for an infrequent workflow.

## Open items deferred to implementation

- **Wishes JSON schema** (the exact zod schema shared by the deterministic parser output and the LLM-fallback prompt) — define in `webapp/src/lib/raster/`.
- **Solver input/output contract** between the worker and `solve-raster-cpsat.py` — pin file formats in `contracts/`.
</content>
