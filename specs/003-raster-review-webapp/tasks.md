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

- [x] T001 Amend constitution to v3.0.0 in `.specify/memory/constitution.md` — added the Rasterzahl Review Webapp as a third capability and permitted web-scoped deps in `webapp/` (resolves the plan's Constitution Check CONFLICT on Principle I).
- [x] T002 [P] Add raster models to `webapp/prisma/schema.postgres.prisma` (InputSet, Wish, HallCapacity, FixedRasterzahl, OptimizationRun, Snapshot, Assignment, Conflict, ReviewDecision per data-model.md)
- [x] T003 Create Prisma migration for the raster models (`migrations-postgres`) and run `prisma:generate`
- [x] T004 [P] Define shared zod schemas in `webapp/src/lib/raster/schemas.ts` (Wish JSON schema, capacity CSV row, fixed-Rasterzahl, run settings)
- [x] T005 [P] Add district-scope + role-gate helpers in `webapp/src/lib/raster/access.ts` (assert admin/scheduler/viewer; scope queries by `district`)
- [x] T006 [P] Seed a demo district + admin/scheduler/viewer users in `webapp/prisma/seed.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**CRITICAL**: No user story work begins until this phase is complete.

- [x] T007 Add pipeline glue in `webapp/src/lib/raster/pipeline.ts` re-exporting root `src/raster` ingest/optimize/report/score entrypoints for webapp use (add named exports to `src/raster/*/index.ts` where missing)
- [x] T008 Define the solver I/O contract in `webapp/src/lib/raster/solver-io.ts` (zod input/output mirroring `scripts/solve-raster-cpsat.py`, including objective breakdown and `sameClubDerbySt4`)
- [x] T009 Scaffold the `raster_run` background job handler in the Python worker registered with the existing job system (no solve logic yet — status transitions only)
- [x] T049 Provision the worker runtime: ensure `Dockerfile.worker` includes Python 3.12 + `uv` + OR-Tools so the job can spawn `scripts/solve-raster-cpsat.py`; add a smoke test that the worker can invoke the solver (FR-010)
- [x] T010 Add the raster service layer skeleton in `webapp/src/services/raster/` (inputSets, capacity, runs, snapshots) with typed functions
- [x] T011 Add the raster dashboard shell + nav entry in `webapp/src/app/(dashboard)/raster/layout.tsx` and route stubs

**Checkpoint**: Models, access control, pipeline glue, job scaffold, and service/UI skeletons exist.

---

## Phase 3: User Story 1 - Generate a Rasterzahl Proposal From Inputs (Priority: P1)

**Goal**: Upload inputs, start a run, get an assignment+conflict snapshot with optimality label.

**Independent Test**: Provide a complete input set, start a run, verify a snapshot with assignments/conflicts consistent with inputs and no fixed-Rasterzahl violation.

### Tests for User Story 1

- [x] T012 [P] [US1] Unit test for wishes JSON schema validation in `webapp/tests/unit/wishes-schema.test.ts` (valid, invalid, incomplete)
- [x] T013 [P] [US1] Unit test for the `raster-run` outcome mapping (CP-SAT status → outcome) and objective-breakdown persistence in `webapp/tests/unit/run-outcome.test.ts`
- [x] T014 [P] [US1] Unit test asserting hard-constraint invariants (fixed Rasterzahl and same-club derby after Spieltag 4 fail rather than persisting a violating snapshot) in `webapp/tests/unit/fixed-constraint.test.ts`
- [x] T050 [P] [US1] Unit/integration test for six-team group review: validation blocks missing mode, accepts normal 6er and 6er Doppelrunde, and passes `rasterMode:"double"` to the worker/solver input.

### Implementation for User Story 1

- [x] T015 [US1] InputSet API + service: `POST/GET /api/raster/input-sets` in `webapp/src/app/api/raster/input-sets/route.ts`
- [x] T016 [P] [US1] Wishes PDF upload → deterministic parse: `POST /api/raster/input-sets/{id}/wishes/pdf` wiring root `src/raster/ingest/wishes-pdf.ts`, persisting Wishes with `confidence`
- [x] T017 [P] [US1] Wishes LLM fallback: `GET .../wishes/prompt` (build prompt from extracted PDF text + JSON schema) and `POST .../wishes/json` (schema-validate, 422 on error)
- [x] T018 [P] [US1] Wishes review/correct UI + `PUT .../wishes/{wishId}` in `webapp/src/components/raster/wishes-review.tsx`
- [x] T019 [P] [US1] Fixed upper-league Rasterzahlen input (PDF/manual/structured): `POST .../fixed-rasterzahlen`
- [x] T020 [US1] InputSet validation: `POST .../validate` (completeness/schema → `ready`) (FR-008)
- [x] T021 [US1] Run start: `POST .../runs` enqueues `raster-run` job; 409 if not `ready` (FR-009)
- [x] T022 [US1] Complete `raster-run` handler: build solver input, spawn `uv run ... solve-raster-cpsat.py`, ingest output, run report/score, create Snapshot + Assignment + Conflict, set optimality/objective/objectiveBreakdown/solverStatus (FR-010–013a)
- [x] T023 [US1] Run status UI + `GET /api/raster/runs/{id}` and cancel; snapshot optimality badge + objective-breakdown component including ST4 derby fallback count (FR-013/013a)
- [x] T051 [US1] Extend generation core for official 6er, 6er Doppelrunde, and 7/8er rulebook support in `src/raster/*`, `scripts/solve-raster-cpsat.py`, and worker conflict persistence.
- [x] T052 [US1] Add group review API/service/UI for parsed groups, including a required normal 6er vs 6er Doppelrunde selector before validation/run start.
- [x] T053 [US1] Persist reviewed group mode in `seasonModelJson` and load it when rendering snapshot penalty events, so 6er Doppelrunde same-club penalties are displayed with the Doppelrunde template.

**Checkpoint**: End-to-end generation works; snapshot respects fixed Rasterzahlen.

---

## Phase 4: User Story 2 - Review Hall Conflicts (Priority: P1)

**Independent Test**: Open a snapshot with overages; overview/summary/detail match run output.

- [x] T048 [US2] Snapshot list + version selection UI and `GET /api/raster/snapshots?district=` (retain/compare review versions; stale badge per FR-014/022, SC-010)
- [x] T024 [US2] Conflict overview API `GET /api/raster/snapshots/{id}` (totals, max excess, affected clubs, top clubs) + visible **stale** indicator in the overview (FR-015/022, SC-010)
- [x] T025 [P] [US2] Conflict list API with filters `GET .../conflicts?club=&weekday=&hall=&week=&minExcess=` (FR-016/017)
- [x] T026 [P] [US2] Per-club conflict summary API `GET .../conflicts/summary` (FR-018)
- [x] T027 [US2] Conflict overview + drill-down UI in `webapp/src/components/raster/conflicts/` (top-10 readable < 30s; ≤ 3 clicks to weeks/teams) (SC-004/005)
- [x] T028 [P] [US2] Empty state: snapshot with no conflicts still allows assignment review (FR-024)
- [x] T047 [US2] Review decisions API + UI: `POST /api/raster/snapshots/{id}/decisions` and controls to mark a conflict or club summary reviewed / needs-correction / accepted-unavoidable (FR-023)

**Checkpoint**: Conflicts fully reviewable.

---

## Phase 5: User Story 3 - Review Team Raster Assignments (Priority: P2)

**Independent Test**: Assignment table matches run output; search finds a team < 15s.

- [x] T029 [US3] Assignment API with filters `GET .../assignments?club=&league=&group=&team=&status=` (FR-019/020)
- [x] T030 [US3] Assignment table UI with search/filter + status badges (optimized/fixed/pinned/missing) in `webapp/src/components/raster/assignments/` (FR-021, SC-007)

**Checkpoint**: Assignments reviewable and searchable.

---

## Phase 6: User Story 4 - Manage Hall Capacity (Priority: P2)

**Independent Test**: Upload CSV, edit via form, guess-then-correct, search; values feed next run; edits mark snapshots stale.

- [x] T031 [P] [US4] Capacity CSV upload `POST /api/raster/capacity/upload` → upsert (FR-004)
- [x] T032 [P] [US4] Capacity search API `GET /api/raster/capacity?district=&q=` (FR-006, SC-008)
- [x] T033 [US4] Capacity edit `PUT /api/raster/capacity/{id}` (last-write-wins) + mark dependent snapshots `stale` (FR-005/022)
- [x] T034 [P] [US4] Inferred/guessed default handling + `basis` badge (reviewed vs inferred vs missing) (FR-005/011)
- [x] T035 [US4] Capacity search/edit UI in `webapp/src/components/raster/capacity/`

**Checkpoint**: Capacity managed, searchable, drives staleness.

---

## Phase 7: User Story 5 - Coordinate Review With Roles (Priority: P3)

**Independent Test**: Sign in per role; allowed/blocked actions correct across upload/run/review/capacity/user-mgmt.

- [x] T036 [US5] Enforce role gates on all raster API routes via `access.ts` (district scope FR-025; viewer read-only; scheduler no run-start/upload; admin full) (FR-025–029)
- [x] T037 [P] [US5] Wire audit events for input uploads, run starts, capacity edits, review-status changes to the baseline audit system (FR-030)
- [x] T038 [P] [US5] Playwright e2e: per-role allowed/blocked matrix in `webapp/tests/e2e/raster-roles.spec.ts` (SC-009)

**Checkpoint**: Access control verified end-to-end.

---

## Phase 8: User Story 6 - Import Pre-Computed External Snapshot (Priority: P4)

**Independent Test**: Import a snapshot; appears in review screens like a generated one; mismatched files warn.

- [x] T039 [US6] Import API `POST /api/raster/snapshots/import` mapping external files → Snapshot/Assignment/Conflict with `origin=imported`, `optimality=imported_heuristic`; warn on identity/row-count mismatch (FR-031)
- [x] T040 [P] [US6] Import UI + mismatch warning in `webapp/src/components/raster/import/`

**Checkpoint**: Optional import path works.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T041 [P] Empty/error states across missing snapshot, run/import failure, permission-denied (FR-024)
- [x] T042 [P] Playwright e2e happy-path generation + review flow in `webapp/tests/e2e/raster-generate.spec.ts` (US1→US2)
- [x] T043 [P] Scanned-PDF fallback path: detect low/no extracted text, guide user to JSON paste / structured upload (edge case)
- [x] T044 [P] Perf spot-check: district-scoped conflict/assignment/capacity views at ~hundreds of rows meet SC-004/007/008
- [x] T045 [P] Docs: update `webapp/README.md` + `docs/raster-open-points.md` with the generation/review flow and solver invocation
- [x] T046 Run `webapp/validate.ps1` (typecheck + lint + tests) and root `pnpm test && pnpm typecheck`; fix issues

---

## Phase 10: Source Hierarchy & DB-Backed Input Caches

**Goal**: Model Germany / WTTV / district hierarchy, store source documents and parsed caches at the scope where they are valid, and refresh cached parsing only on explicit request.

**Independent Test**: Register a WTTV group source, open an OWL raster flow, verify the WTTV source is visible to OWL users with parent-scope access, and verify reopening the input set does not reparse until refresh/upload is requested.

- [x] T054 [US1] Extend `webapp/prisma/schema.postgres.prisma` and migrations with hierarchical `Scope.parentId` for Germany → WTTV → district scopes.
- [x] T055 [US1] Update `webapp/prisma/seed.ts` to seed `DE`, `WTTV`, and WTTV district hierarchy while preserving demo OWL users.
- [x] T056 [US5] Update `webapp/src/lib/raster/access.ts` so users assigned to parent scopes can access child district raster data according to role.
- [x] T057 [P] [US5] Add hierarchy access tests in `webapp/tests/unit/raster-access.test.ts`.
- [x] T058 [US1] Add `RasterSource` model and migration for scoped documents/links/parsed cache in `webapp/prisma/schema.postgres.prisma`.
- [x] T059 [US1] Add DB-backed cache fields `groupAssignmentJson` and `wishesJson` to `RasterInputSet` and migration.
- [x] T060 [US1] Update `webapp/src/services/raster/inputSets.ts` and `webapp/src/services/raster/wishes.ts` so caches are written only on source upload/update paths.
- [x] T061 [P] [US1] Add source service helpers and tests in `webapp/src/services/raster/sources.ts`, `webapp/tests/unit/raster-sources-service.test.ts`, and `webapp/tests/unit/raster-wishes-service.test.ts`.
- [x] T062 [US1] Add `GET/POST /api/raster/sources` in `webapp/src/app/api/raster/sources/route.ts` with route tests in `webapp/tests/unit/raster-sources-route.test.ts`.
- [x] T063 [US1] Add Raster page source list/manual source-cache form in `webapp/src/components/raster/sources/raster-sources-panel.tsx` and wire it into `webapp/src/app/(dashboard)/raster/page.tsx`.
- [x] T064 [US1] Add explicit parser refresh action for a stored `RasterSource` in `webapp/src/app/api/raster/sources/[id]/refresh/route.ts`, supporting group assignment and wishes PDF source types without refreshing on ordinary page load.
- [x] T065 [US1] Add source upload/link UI controls in `webapp/src/components/raster/sources/raster-sources-panel.tsx` so admins can upload replacement PDFs or trigger click-TT parsing for a selected hierarchy scope.
- [x] T066 [US1] Wire refreshed `RasterSource.parsedJson` into input-set preparation in `webapp/src/services/raster/inputSets.ts`, allowing OWL input sets to consume inherited WTTV group assignment cache plus OWL wishes cache.
- [x] T067 [P] [US1] Add Playwright coverage in `webapp/tests/e2e/raster-generate.spec.ts` proving an inherited WTTV source appears in the OWL flow and is not reparsed on reload.

---

## Phase 11: Follow-Up Gap Closure From Admin Workflow Review

**Goal**: Close the practical workflow gaps discovered during manual admin review: guided source preparation, season/district hierarchy, source cleanup, and visible run/results controls.

**Independent Test**: As an admin, select a season and WTTV district from hierarchy-sorted controls, register a click-TT group URL, upload multiple wish PDFs, delete a wrong source, create/validate an input set with zero fixed schedule numbers, start a background run, and open the generated result view without API/manual log inspection.

- [x] T068 [US1] Add season to `RasterSource` and `RasterInputSet`, migrations, source/input-set services, and route tests so sources/input sets are isolated per season.
- [x] T069 [US5] Seed WTTV plus all listed WTTV districts and show district selection from configured scopes sorted/labeled by hierarchy instead of free-text district entry.
- [x] T070 [US1] Change the visible source UI to use click-TT league URLs for group assignment and multi-file wish PDF upload; keep group-assignment file upload only as hidden/advanced fallback.
- [x] T071 [US1] Add optional fixed schedule number editing on input sets and prove run creation does not require any fixed schedule numbers.
- [x] T072 [US1] Add source deletion and PDF byte validation for wish uploads, with route tests.
- [x] T073 [US1] Add visible source parse state and a single refresh/parse action flow, including clear errors when a source cannot be parsed as `GROUP_ASSIGNMENT` or `WISHES_PDF`.
- [x] T074 [US1] Add guided next-step controls on the Raster page: create input set, validate, start run, and display why a run is blocked.
- [x] T075 [US1] Wire the local/background worker command or dev workflow so `raster_run` jobs created by the webapp are actually processed in local development.
- [x] T076 [US1] Add run status UI in the Raster page showing pending/running/failed/completed jobs with cancel where supported.
- [x] T077 [US2] Add a reachable snapshot/results view from the Raster page using the existing assignment/conflict/snapshot APIs and components.
- [x] T078 [US1] Add Playwright coverage for the real guided admin workflow: season + hierarchy district selection, click-TT URL source, multi-wish upload, delete wrong source, validate/start, and open results.

**Checkpoint**: The admin can complete the intended workflow from the UI without knowing internal source types, API routes, or worker mechanics.

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
- **Source hierarchy/cache (Phase 10)**: schema/access tasks T054–T059 before APIs/UI; T064–T066 complete parser integration; T067 verifies behavior end-to-end.
- **Gap closure (Phase 11)**: T068–T078 are implemented and covered by focused tests.

### Parallel Opportunities

- T004, T005, T006 parallel.
- T012, T013, T014 (US1 tests) parallel.
- T016, T017, T018, T019 (distinct input types) parallel.
- T025, T026, T028 parallel; T031, T032, T034 parallel.
- US2 and US3 can proceed in parallel once US1 produces a snapshot.
- T064 and T065 can proceed in parallel after T062/T063.

### MVP

US1 + US2 (generate a proposal and review its conflicts) is the minimum valuable release. Phase 11 closes the manual-review gaps discovered during admin workflow testing.

---

## Notes

- [P] = different files, no dependencies.
- Generation core is reused, not rebuilt (`src/raster/*`, `scripts/solve-raster-cpsat.py`).
- Safety invariants: role gates (FR-025–029) and the fixed-Rasterzahl hard constraint (SC-003) are test-backed (T014, T038).
- T001 is a governance prerequisite — the plan's Constitution Check fails until it lands.
  </content>
