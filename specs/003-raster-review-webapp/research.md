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

## Open items deferred to implementation

- **Wishes JSON schema** (the exact zod schema shared by the deterministic parser output and the LLM-fallback prompt) — define in `webapp/src/lib/raster/`.
- **Solver input/output contract** between the worker and `solve-raster-cpsat.py` — pin file formats in `contracts/`.
</content>
