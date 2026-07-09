# Tasks: Raster Generation & Review Webapp

**Input**: Design documents from `specs/003-raster-review-webapp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Unit tests for the wishes parser/services and Playwright e2e for role/flow are requested (safety-critical: role gates + fixed-Rasterzahl invariant).

**Organization**: Tasks grouped by user story. All feature work lands in `webapp/`; the generation core (`src/raster/*`, `scripts/solve-raster-cpsat.py`) is reused.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US6 map to spec user stories

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Amend constitution to v3.0.0 in `.specify/memory/constitution.md` — added the Rasterzahl Review Webapp as a third capability and permitted web-scoped deps in `webapp/` (resolves the plan's Constitution Check CONFLICT on Principle I).
- [ ] T002 [P] Add raster models to `webapp/prisma/schema.prisma` and `webapp/prisma/schema.postgres.prisma` (InputSet, Wish, HallCapacity, FixedRasterzahl, OptimizationRun, Snapshot, Assignment, Conflict, ReviewDecision per data-model.md)
- [ ] T003 Create Prisma migration for the raster models (SQLite + `migrations-postgres`) and run `prisma:generate`
- [ ] T004 [P] Define shared zod schemas in `webapp/src/lib/raster/schemas.ts` (Wish JSON schema, capacity CSV row, fixed-Rasterzahl, run settings)
- [ ] T005 [P] Add district-scope + role-gate helpers in `webapp/src/lib/raster/access.ts` (assert admin/scheduler/viewer; scope queries by `district`)
- [ ] T006 [P] Seed a demo district + admin/scheduler/viewer users in `webapp/prisma/seed.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**CRITICAL**: No user story work begins until this phase is complete.

- [ ] T007 Add pipeline glue in `webapp/src/lib/raster/pipeline.ts` re-exporting root `src/raster` ingest/optimize/report/score entrypoints for webapp use (add named exports to `src/raster/*/index.ts` where missing)
- [ ] T008 Define the solver I/O contract in `webapp/src/lib/raster/solver-io.ts` (zod input/output mirroring `scripts/solve-raster-cpsat.py`)
- [ ] T009 Scaffold the `raster-run` background job handler in `webapp/worker/raster-run.ts` registered with the existing job system (no solve logic yet — status transitions only)
- [ ] T049 Provision the worker runtime: ensure `Dockerfile.worker` includes Python 3.12 + `uv` + OR-Tools so the job can spawn `scripts/solve-raster-cpsat.py`; add a smoke test that the worker can invoke the solver (FR-010)
- [ ] T010 Add the raster service layer skeleton in `webapp/src/services/raster/` (inputSets, capacity, runs, snapshots) with typed function stubs
- [ ] T011 Add the raster dashboard shell + nav entry in `webapp/src/app/(dashboard)/raster/layout.tsx` and route stubs

**Checkpoint**: Models, access control, pipeline glue, job scaffold, and service/UI skeletons exist.

---

## Phase 3: User Story 1 - Generate a Rasterzahl Proposal From Inputs (Priority: P1)

**Goal**: Upload inputs, start a run, get an assignment+conflict snapshot with optimality label.

**Independent Test**: Provide a complete input set, start a run, verify a snapshot with assignments/conflicts consistent with inputs and no fixed-Rasterzahl violation.

### Tests for User Story 1

- [ ] T012 [P] [US1] Unit test for wishes JSON schema validation in `webapp/tests/unit/wishes-schema.test.ts` (valid, invalid, incomplete)
- [ ] T013 [P] [US1] Unit test for the `raster-run` outcome mapping (CP-SAT status → outcome) in `webapp/tests/unit/run-outcome.test.ts`
- [ ] T014 [P] [US1] Unit test asserting the fixed-Rasterzahl hard-constraint invariant (job fails rather than persisting a violating snapshot) in `webapp/tests/unit/fixed-constraint.test.ts`

### Implementation for User Story 1

- [ ] T015 [US1] InputSet API + service: `POST/GET /api/raster/input-sets` in `webapp/src/app/api/raster/input-sets/route.ts`
- [ ] T016 [P] [US1] Wishes PDF upload → deterministic parse: `POST /api/raster/input-sets/{id}/wishes/pdf` wiring root `src/raster/ingest/wishes-pdf.ts`, persisting Wishes with `confidence`
- [ ] T017 [P] [US1] Wishes LLM fallback: `GET .../wishes/prompt` (build prompt from extracted PDF text + JSON schema) and `POST .../wishes/json` (schema-validate, 422 on error)
- [ ] T018 [P] [US1] Wishes review/correct UI + `PUT .../wishes/{wishId}` in `webapp/src/components/raster/wishes-review.tsx`
- [ ] T019 [P] [US1] Fixed upper-league Rasterzahlen input (PDF/manual/structured): `POST .../fixed-rasterzahlen`
- [ ] T020 [US1] InputSet validation: `POST .../validate` (completeness/schema → `ready`) (FR-008)
- [ ] T021 [US1] Run start: `POST .../runs` enqueues `raster-run` job; 409 if not `ready` (FR-009)
- [ ] T022 [US1] Complete `raster-run` handler: build solver input, spawn `uv run ... solve-raster-cpsat.py`, ingest output, run report/score, create Snapshot + Assignment + Conflict, set optimality/objective/solverStatus (FR-010–013)
- [ ] T023 [US1] Run status UI + `GET /api/raster/runs/{id}` and cancel; snapshot optimality badge component (FR-013)

**Checkpoint**: End-to-end generation works; snapshot respects fixed Rasterzahlen.

---

## Phase 4: User Story 2 - Review Hall Conflicts (Priority: P1)

**Independent Test**: Open a snapshot with overages; overview/summary/detail match run output.

- [ ] T048 [US2] Snapshot list + version selection UI and `GET /api/raster/snapshots?district=` (retain/compare review versions; stale badge per FR-014/022, SC-010)
- [ ] T024 [US2] Conflict overview API `GET /api/raster/snapshots/{id}` (totals, max excess, affected clubs, top clubs) + visible **stale** indicator in the overview (FR-015/022, SC-010)
- [ ] T025 [P] [US2] Conflict list API with filters `GET .../conflicts?club=&weekday=&hall=&week=&minExcess=` (FR-016/017)
- [ ] T026 [P] [US2] Per-club conflict summary API `GET .../conflicts/summary` (FR-018)
- [ ] T027 [US2] Conflict overview + drill-down UI in `webapp/src/components/raster/conflicts/` (top-10 readable < 30s; ≤ 3 clicks to weeks/teams) (SC-004/005)
- [ ] T028 [P] [US2] Empty state: snapshot with no conflicts still allows assignment review (FR-024)
- [ ] T047 [US2] Review decisions API + UI: `POST /api/raster/snapshots/{id}/decisions` and controls to mark a conflict or club summary reviewed / needs-correction / accepted-unavoidable (FR-023)

**Checkpoint**: Conflicts fully reviewable.

---

## Phase 5: User Story 3 - Review Team Raster Assignments (Priority: P2)

**Independent Test**: Assignment table matches run output; search finds a team < 15s.

- [ ] T029 [US3] Assignment API with filters `GET .../assignments?club=&league=&group=&team=&status=` (FR-019/020)
- [ ] T030 [US3] Assignment table UI with search/filter + status badges (optimized/fixed/pinned/missing) in `webapp/src/components/raster/assignments/` (FR-021, SC-007)

**Checkpoint**: Assignments reviewable and searchable.

---

## Phase 6: User Story 4 - Manage Hall Capacity (Priority: P2)

**Independent Test**: Upload CSV, edit via form, guess-then-correct, search; values feed next run; edits mark snapshots stale.

- [ ] T031 [P] [US4] Capacity CSV/Excel upload `POST /api/raster/capacity/upload` → upsert (FR-004)
- [ ] T032 [P] [US4] Capacity search API `GET /api/raster/capacity?district=&q=` (FR-006, SC-008)
- [ ] T033 [US4] Capacity edit `PUT /api/raster/capacity/{id}` (last-write-wins, audited) + mark dependent snapshots `stale` (FR-005/022)
- [ ] T034 [P] [US4] Inferred/guessed default handling + `basis` badge (reviewed vs inferred vs missing) (FR-005/011)
- [ ] T035 [US4] Capacity search/edit UI in `webapp/src/components/raster/capacity/`

**Checkpoint**: Capacity managed, searchable, drives staleness.

---

## Phase 7: User Story 5 - Coordinate Review With Roles (Priority: P3)

**Independent Test**: Sign in per role; allowed/blocked actions correct across upload/run/review/capacity/user-mgmt.

- [ ] T036 [US5] Enforce role gates on all raster API routes via `access.ts` (district scope FR-025; viewer read-only; scheduler no run-start/upload; admin full) (FR-025–029)
- [ ] T037 [P] [US5] Wire audit events for input uploads, run starts, capacity edits, review-status changes to the baseline audit system (FR-030)
- [ ] T038 [P] [US5] Playwright e2e: per-role allowed/blocked matrix in `webapp/tests/e2e/raster-roles.spec.ts` (SC-009)

**Checkpoint**: Access control verified end-to-end.

---

## Phase 8: User Story 6 - Import Pre-Computed External Snapshot (Priority: P4)

**Independent Test**: Import a snapshot; appears in review screens like a generated one; mismatched files warn.

- [ ] T039 [US6] Import API `POST /api/raster/snapshots/import` mapping external files → Snapshot/Assignment/Conflict with `origin=imported`, `optimality=imported_heuristic`; warn on identity/row-count mismatch (FR-031)
- [ ] T040 [P] [US6] Import UI + mismatch warning in `webapp/src/components/raster/import/`

**Checkpoint**: Optional import path works.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T041 [P] Empty/error states across missing snapshot, run/import failure, permission-denied (FR-024)
- [ ] T042 [P] Playwright e2e happy-path generation + review flow in `webapp/tests/e2e/raster-generate.spec.ts` (US1→US2)
- [ ] T043 [P] Scanned-PDF fallback path: detect low/no extracted text, guide user to JSON paste / structured upload (edge case)
- [ ] T044 [P] Perf spot-check: district-scoped conflict/assignment/capacity views at ~hundreds of rows meet SC-004/007/008
- [ ] T045 [P] Docs: update `webapp/README.md` + `docs/raster-open-points.md` with the generation/review flow and solver invocation
- [ ] T046 Run `webapp/validate.ps1` (typecheck + lint + tests) and root `pnpm test && pnpm typecheck`; fix issues

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 governance blocker first; T002→T003 (schema→migration) ordered; T004/T005/T006 parallel after.
- **Foundational (Phase 2)**: after Setup; blocks all stories. T007/T008 before T009 (job needs solver I/O) and before T022.
- **US1 (Phase 3)**: after Foundational — core MVP.
- **US2 (Phase 4)**: needs a Snapshot (US1) to review.
- **US3 (Phase 5)**: needs a Snapshot (US1).
- **US4 (Phase 6)**: capacity models (Phase 1) + staleness needs Snapshot (US1) for the stale-marking part.
- **US5 (Phase 7)**: gates apply across all prior routes — do after routes exist, before release.
- **US6 (Phase 8)**: reuses review layer (US2/US3).
- **Polish (Phase 9)**: after target stories.

### Parallel Opportunities

- T004, T005, T006 parallel.
- T012, T013, T014 (US1 tests) parallel.
- T016, T017, T018, T019 (distinct input types) parallel.
- T025, T026, T028 parallel; T031, T032, T034 parallel.
- US2 and US3 can proceed in parallel once US1 produces a snapshot.

### MVP

US1 + US2 (generate a proposal and review its conflicts) is the minimum valuable release. US3–US6 are incremental.

---

## Notes

- [P] = different files, no dependencies.
- Generation core is reused, not rebuilt (`src/raster/*`, `scripts/solve-raster-cpsat.py`).
- Safety invariants: role gates (FR-025–029) and the fixed-Rasterzahl hard constraint (SC-003) are test-backed (T014, T038).
- T001 is a governance prerequisite — the plan's Constitution Check fails until it lands.
</content>
