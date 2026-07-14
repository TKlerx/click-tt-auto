# Tasks: Raster Run Comparison

**Input**: Design documents from `specs/004-compare-raster-runs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Include focused unit/route tests because the feature changes validation, scoring, and persisted comparison state.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story label from spec.md
- Every task names exact files to touch

## Phase 1: Setup

**Purpose**: Reuse the existing raster webapp shape and create shared comparison vocabulary.

- [x] T001 Add scenario strategy/status TypeScript types in `webapp/src/lib/raster/scenarios.ts`
- [x] T002 [P] Add KPI summary TypeScript type and mapper skeleton in `webapp/src/lib/raster/kpis.ts`
- [x] T003 [P] Add scenario route test fixtures in `webapp/tests/unit/fixtures/raster-scenarios.ts`

---

## Phase 2: Foundational

**Purpose**: Blocking scenario persistence/read model shared by all stories.

- [x] T004 Extend `webapp/prisma/schema.postgres.prisma` with the minimal fields/models needed for manual scenarios and scenario metadata
- [x] T005 Add matching Prisma migration under `webapp/prisma/migrations-postgres/`
- [x] T006 Add scenario service list/read helpers in `webapp/src/services/raster/scenarios.ts`
- [x] T007 Wire optimizer run/snapshot rows into the scenario read model in `webapp/src/services/raster/scenarios.ts`
- [x] T008 Implement shared KPI mapper from existing score/output fields in `webapp/src/lib/raster/kpis.ts`
- [x] T009 [P] Unit test KPI mapping in `webapp/tests/unit/raster-kpis.test.ts`
- [x] T010 [P] Unit test scenario compatibility filtering in `webapp/tests/unit/raster-scenarios-service.test.ts`

**Checkpoint**: Scenario list can represent existing optimizer runs with shared KPI fields.

---

## Phase 3: User Story 1 - Compare Scheduling Scenarios (Priority: P1) MVP

**Goal**: Admins can compare compatible scenarios side by side with KPI deltas.

**Independent Test**: Open an input set with at least two completed scenarios and verify KPI summaries, baseline deltas, statuses, and detail links.

- [x] T011 [P] Add route tests for `GET /api/raster/scenarios` and `POST /api/raster/scenarios/compare` in `webapp/tests/unit/raster-scenarios-route.test.ts`
- [x] T012 Implement `GET /api/raster/scenarios` in `webapp/src/app/api/raster/scenarios/route.ts`
- [x] T013 Implement `POST /api/raster/scenarios/compare` compatibility checks and deltas in `webapp/src/app/api/raster/scenarios/compare/route.ts`
- [x] T014 Add scenario comparison service function in `webapp/src/services/raster/scenarioComparison.ts`
- [x] T015 Add scenario list/comparison UI in `webapp/src/components/raster/scenario-comparison.tsx`
- [x] T016 Wire comparison UI into `webapp/src/app/(dashboard)/raster/page.tsx`
- [x] T017 [P] Add UI/unit test for baseline delta rendering in `webapp/tests/unit/scenario-comparison.test.tsx`

**Checkpoint**: P1 comparison works without manual assignment creation.

---

## Phase 4: User Story 2 - Run Alternative Optimizers (Priority: P2)

**Goal**: Admins can explicitly run `Initial heuristic` or `CP-SAT` and see honest status/history.

**Independent Test**: Queue both strategies for the same input set and confirm each creates a scenario with strategy, status, settings, KPIs/details after completion.

- [x] T018 Extend run-start request validation with `strategy` and optional `timeLimitSeconds` in `webapp/src/app/api/raster/input-sets/[id]/runs/route.ts`
- [x] T019 Pass selected strategy/settings through run creation in `webapp/src/services/raster/runs.ts`
- [x] T020 Add heuristic strategy execution path using existing `src/raster/optimize` code in `webapp/worker/src/starter_worker/raster_run.py`
- [x] T021 Preserve CP-SAT feasible/failed/no-solution status in scenario metadata in `webapp/src/services/raster/scenarios.ts`
- [x] T022 Add strategy selector and visible time-budget control in `webapp/src/components/raster/run-controls.tsx`
- [x] T023 [P] Unit test run-start strategy validation in `webapp/tests/unit/raster-runs-route.test.ts`
- [x] T024 [P] Unit test worker outcome-to-scenario status mapping in `webapp/tests/unit/raster-run-status.test.ts`

**Checkpoint**: Both automated strategies create comparable scenarios.

---

## Phase 5: User Story 3 - Import and Score Manual Assignments (Priority: P2)

**Goal**: Admins can visually enter or import a manual schedule-number plan, validate it, score it, and compare it.

**Independent Test**: Enter a complete manual assignment for one input set and verify it becomes a comparable scenario with shared KPIs and details.

- [x] T025 Add manual assignment validation helpers in `webapp/src/lib/raster/manualAssignments.ts`
- [x] T026 [P] Unit test duplicate/illegal/missing/unknown manual assignment validation in `webapp/tests/unit/manual-assignments.test.ts`
- [x] T027 Implement manual draft persistence service in `webapp/src/services/raster/manualAssignments.ts`
- [x] T028 Implement `POST /api/raster/input-sets/[id]/manual-assignments` in `webapp/src/app/api/raster/input-sets/[id]/manual-assignments/route.ts`
- [x] T029 Implement `POST /api/raster/manual-assignments/[id]/validate` in `webapp/src/app/api/raster/manual-assignments/[id]/validate/route.ts`
- [x] T030 Implement `POST /api/raster/manual-assignments/[id]/score` using shared scoring in `webapp/src/app/api/raster/manual-assignments/[id]/score/route.ts`
- [x] T031 Add simple paste/table parser in `webapp/src/lib/raster/manualAssignmentImport.ts`
- [x] T032 [P] Unit test paste/table import matching in `webapp/tests/unit/manual-assignment-import.test.ts`
- [x] T033 Add visual manual assignment form in `webapp/src/components/raster/manual-assignment-form.tsx`
- [x] T034 Wire manual assignment entry into `webapp/src/app/(dashboard)/raster/page.tsx`

**Checkpoint**: Manual plans can be scored and compared with optimizer scenarios.

---

## Phase 6: User Story 4 - Review Scenario Details (Priority: P3)

**Goal**: Admins can drill from comparison into assignments, conflicts, and KPI explanations.

**Independent Test**: Open scenario details from comparison in no more than two interactions.

- [x] T035 Add scenario details service in `webapp/src/services/raster/scenarioDetails.ts`
- [x] T036 Implement `GET /api/raster/scenarios/[id]` in `webapp/src/app/api/raster/scenarios/[id]/route.ts`
- [x] T037 Add scenario detail view component in `webapp/src/components/raster/scenario-details.tsx`
- [x] T038 Wire scenario detail route or panel in `webapp/src/app/(dashboard)/raster/page.tsx`
- [x] T039 [P] Unit test scenario detail route in `webapp/tests/unit/raster-scenario-details-route.test.ts`

---

## Phase 7: Polish & Cross-Cutting

- [x] T040 Add stale marker propagation when input set/scoring assumptions change in `webapp/src/services/raster/scenarios.ts`
- [x] T041 [P] Add Playwright smoke test for compare + manual score flow in `webapp/tests/e2e/raster-generate.spec.ts`
- [x] T042 Update `specs/004-compare-raster-runs/quickstart.md` with any implementation-specific route names
- [x] T043 Run `pnpm --dir webapp run typecheck` and fix 004 regressions
- [x] T044 Run focused unit tests for 004 and root scoring tests
- [ ] T045 [Backlog] Add infeasibility diagnostics that identify which hard constraint family blocks a CP-SAT run in `scripts/solve-raster-cpsat.py` and `webapp/worker/src/starter_worker/main.py`
- [ ] T046 [Backlog] Show infeasibility diagnostics next to the no-solution run state in `webapp/src/components/raster/input-set-actions.tsx`

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup and blocks all user stories.
- **US1 (P1)**: starts after Foundation and is the MVP.
- **US2 (P2)**: starts after Foundation; integrates with US1 scenario list.
- **US3 (P2)**: starts after Foundation; integrates with US1 comparison and shared scoring.
- **US4 (P3)**: starts after US1, then reads details for any scenario origin.
- **Polish**: after desired stories are complete.

## Parallel Opportunities

- T002 and T003 can run after T001.
- T009 and T010 can run after T006-T008.
- T011 and T017 can run while T012-T016 are implemented.
- T023 and T024 can run while T018-T022 are implemented.
- T026 and T032 can run while manual assignment routes/UI are implemented.

## Implementation Strategy

1. Ship Foundation + US1 first so existing optimizer runs become comparable.
2. Add US2 to make strategy choice explicit.
3. Add US3 to bring colleague/manual plans into the same scoring path.
4. Add US4 detail drilldown after the comparison table is useful.
