# Tasks: Manual Baseline Rasterzahlen Import

**Input**: Design documents from `/specs/012-manual-baseline-raster/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/manual-baseline-api.md`

**Tests**: Included because every user story defines an independent test and the feature handles live authenticated data, persistence, access control, and solver-safety boundaries.

**Organization**: Tasks are grouped by user story so each increment remains independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on another incomplete task in the same phase.
- **[Story]**: Maps the task to a user story from `spec.md`.

## Phase 1: Setup

**Purpose**: Add the shared persistence and runtime prerequisites.

- [x] T001 Add `RasterManualBaselineStatus`, `RasterManualBaselineRowStatus`, `RasterManualBaseline`, `RasterManualBaselineRow`, their user/input-set relations, and nullable `RasterOptimizationRun.baselineId` to `webapp/prisma/schema.postgres.prisma`.
- [x] T002 Create the PostgreSQL migration, including active/importing partial unique indexes and FKs, in `webapp/prisma/migrations-postgres/<timestamp>_manual_baseline/migration.sql`.
- [x] T003 [P] Add baseline import/review/run-selection zod schemas to `webapp/src/lib/raster/schemas.ts`.
- [x] T004 [P] Add the repo's existing `playwright` package to webapp production dependencies and make its Chromium binary available to the production app scraper path in `webapp/package.json`, `webapp/pnpm-lock.yaml`, and `webapp/Dockerfile.app` without adding a second crawler runtime.

---

## Phase 2: Foundational Services

**Purpose**: Build the shared baseline lifecycle used by every story.

**⚠️ CRITICAL**: User-story work depends on this phase.

- [x] T005 Add source identity normalization, exact season-model team matching, row range/context validation, and comparison types in `webapp/src/services/raster/manualBaselines.ts`.
- [x] T006 Implement baseline version creation, concurrent-import rejection, atomic activation, failure preservation, active/history reads, and status counts in `webapp/src/services/raster/manualBaselines.ts`.
- [x] T007 Export baseline services through `webapp/src/services/raster/index.ts` and add the required static scraper bridge in `webapp/src/lib/raster/pipeline.ts`.
- [x] T008 Add baseline lifecycle unit tests for concurrency, atomic activation, failed refresh preservation, exact matching, duplicates, invalid ranges, and status counts in `webapp/tests/unit/raster-manual-baseline-service.test.ts`.

**Checkpoint**: Versioned baseline imports can be persisted safely without UI or run integration.

---

## Phase 3: User Story 1 — Import Current Manual Baseline (Priority: P1) 🎯 MVP

**Goal**: A scheduler imports all current expert-set Rasterzahlen for one workspace through verified live click-TT navigation.

**Independent Test**: Run the import against captured pages or a test account and verify the stored rows and source context match the selected scope/season while a failed refresh leaves the old active version intact.

### Tests for User Story 1

- [x] T009 [P] [US1] Add captured navigation/row tests covering duplicate group labels, source group/team context, and out-of-scope rejection in `tests/unit/manual-baseline-scrape.test.ts`.
- [x] T010 [P] [US1] Add scheduler import API tests for success, concurrent `409`, contextual failure, and previous-baseline preservation in `webapp/tests/integration/raster-manual-baseline-api.test.ts`.

### Implementation for User Story 1

- [x] T011 [US1] Extend the existing authenticated live group traversal to emit verified baseline row context without replaying collected admin URLs in `src/raster/ingest/clicktt-assignments.ts` and `src/raster/ingest/scrape.ts`.
- [x] T012 [US1] Implement the crawl-to-version import orchestration and sanitized scope/group/navigation failure details in `webapp/src/services/raster/manualBaselines.ts`.
- [x] T013 [US1] Implement viewer `GET` and scheduler `POST` baseline endpoints in `webapp/src/app/api/raster/input-sets/[id]/baseline/route.ts`, including audit entries for import success/failure.
- [x] T014 [US1] Add baseline import, refresh, active status, row-count summary, and version-history UI in `webapp/src/components/raster/baseline/baseline-review.tsx`.
- [x] T015 [US1] Render the baseline panel on `webapp/src/app/(dashboard)/raster/review/page.tsx` without starting imports during page render.
- [x] T016 [P] [US1] Add baseline import/status strings to all locale files in `webapp/src/i18n/messages/`.
- [x] T017 [US1] Add the scheduler import/refresh happy-path and failed-refresh browser journey in `webapp/tests/e2e/raster-manual-baseline.spec.ts`.

**Checkpoint**: User Story 1 imports and versions the manual baseline safely.

---

## Phase 4: User Story 2 — Review Baseline Mappings (Priority: P1)

**Goal**: A scheduler resolves every ambiguous, unmatched, duplicate, invalid, or changed row in one review area, with compatible decisions retained after refresh.

**Independent Test**: Import exact, ambiguous, unmatched, renamed, duplicate, and invalid fixture rows; verify only settled rows permit `READY`, and a refresh reuses only still-valid identity decisions.

### Tests for User Story 2

- [x] T018 [P] [US2] Add unit tests for map/ignore/accept decisions, readiness transitions, stale target rejection, and refresh decision carry-forward in `webapp/tests/unit/raster-manual-baseline-service.test.ts`.
- [x] T019 [P] [US2] Add scheduler/viewer row-decision API tests in `webapp/tests/integration/raster-manual-baseline-api.test.ts`.

### Implementation for User Story 2

- [x] T020 [US2] Implement reviewed row mutations, readiness recalculation, and stable source-identity decision carry-forward in `webapp/src/services/raster/manualBaselines.ts`.
- [x] T021 [US2] Implement the scheduler-only map/ignore/accept endpoint with target-team validation and audit output in `webapp/src/app/api/raster/input-sets/[id]/baseline/rows/[rowId]/route.ts`.
- [x] T022 [US2] Extend `webapp/src/components/raster/baseline/baseline-review.tsx` with the single unresolved-row table, target selector, reason/status display, and correction controls.
- [x] T023 [US2] Add review completion, refresh carry-forward, and changed-source-row coverage to `webapp/tests/e2e/raster-manual-baseline.spec.ts`.

**Checkpoint**: User Stories 1 and 2 produce a reviewed, reusable `READY` baseline.

---

## Phase 5: User Story 3 — Use Baseline as Optional Comparison (Priority: P2)

**Goal**: A scheduler optionally attaches a reviewed baseline to a run and sees unchanged, changed, new, and missing assignments afterward.

**Independent Test**: Start equivalent runs with and without a baseline; verify only the linked run records the exact baseline version and exposes deltas, with identical solver constraints in both runs.

### Tests for User Story 3

- [x] T024 [P] [US3] Add run-service tests for same-workspace `READY` baseline validation, immutable version linkage, omission compatibility, and unchanged solver payload in `webapp/tests/unit/raster-runs-service.test.ts`.
- [x] T025 [P] [US3] Add unchanged/changed/new/missing projection tests in `webapp/tests/unit/raster-manual-baseline-service.test.ts`.

### Implementation for User Story 3

- [x] T026 [US3] Accept and validate optional `baselineId` during run creation in `webapp/src/services/raster/runs.ts` and `webapp/src/app/api/raster/input-sets/[id]/runs/route.ts` without passing baseline rows to the solver.
- [x] T027 [US3] Add optional reviewed-baseline selection to `webapp/src/components/raster/input-set-actions.tsx` and preserve current behavior when none is selected.
- [x] T028 [US3] Implement snapshot baseline delta projection in `webapp/src/services/raster/manualBaselines.ts` and expose it through existing snapshot reads.
- [x] T029 [US3] Add unchanged/changed/new/missing counts and details in `webapp/src/components/raster/baseline/baseline-comparison.tsx` and render it from `webapp/src/app/(dashboard)/raster/snapshots/[id]/page.tsx`.
- [x] T030 [US3] Add with-baseline/without-baseline comparison coverage to `webapp/tests/e2e/raster-manual-baseline.spec.ts`.

**Checkpoint**: Baseline comparison is useful but remains completely optional and non-constraining.

---

## Phase 6: User Story 4 — Keep Read-Only Viewing Safe (Priority: P3)

**Goal**: Read-only users can inspect permitted baseline information without seeing mutation controls or triggering writes.

**Independent Test**: Render baseline/review/result pages as a scope viewer with and without baseline data and verify zero baseline rows/versions are created and every mutation endpoint returns `403`.

### Tests and Implementation for User Story 4

- [x] T031 [P] [US4] Add viewer read and mutation-denial coverage to `webapp/tests/integration/raster-manual-baseline-api.test.ts`.
- [x] T032 [P] [US4] Add read-only render/no-write-on-read coverage to `webapp/tests/e2e/raster-manual-baseline.spec.ts`.
- [x] T033 [US4] Gate import and row-decision controls by existing scheduler access while keeping baseline status/comparison visible in `webapp/src/components/raster/baseline/baseline-review.tsx` and `webapp/src/components/raster/baseline/baseline-comparison.tsx`.

**Checkpoint**: All four stories are independently verified.

---

## Phase 7: Polish & Cross-Cutting

- [x] T034 [P] Document deployment credentials, Chromium/runtime requirements, and baseline operations in `README.md` and `specs/012-manual-baseline-raster/quickstart.md`.
- [x] T035 Verify baseline import/audit error payloads contain no credentials, cookies, tokens, or raw page dumps in `webapp/tests/integration/raster-manual-baseline-api.test.ts`.
- [x] T036 Run the focused root/webapp suites, Prisma validation, Playwright E2E, and `pwsh -File ./validate.ps1`; record any environment-only live click-TT verification in `specs/012-manual-baseline-raster/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts immediately; T002 follows T001.
- **Foundational (Phase 2)**: depends on T001–T004 and blocks all stories.
- **US1 (Phase 3)**: depends on Foundation; this is the first deployable slice.
- **US2 (Phase 4)**: depends on US1 baseline rows and completes the P1 product.
- **US3 (Phase 5)**: depends on a `READY` baseline from US2.
- **US4 (Phase 6)**: can begin after US1 routes/components exist; final verification spans US2/US3 controls.
- **Polish (Phase 7)**: follows the desired user stories.

### User Story Dependencies

- **US1**: no story dependency after Foundation.
- **US2**: depends on US1 import/version lifecycle.
- **US3**: depends on US2 readiness semantics.
- **US4**: depends on the read/write surfaces from US1–US3 but adds no domain dependency.

### Parallel Opportunities

- T003 and T004 can run alongside schema/migration work.
- T009 and T010 can be written in parallel before US1 implementation.
- T018 and T019 can be written in parallel before US2 implementation.
- T024 and T025 can be written in parallel before US3 implementation.
- T031 and T032 cover separate API/browser safety paths.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 import/versioning.
3. Complete US2 review/readiness.
4. Validate the P1 product before adding run comparison.

### Incremental Delivery

1. Import and preserve versions.
2. Resolve mappings and reach `READY`.
3. Optionally link a baseline to runs and render deltas.
4. Lock down read-only behavior and complete cross-cutting validation.

## Notes

- Baseline values must never enter `RasterFixedRasterzahl` or solver constraints.
- Captured admin URLs are provenance only and must never be replayed.
- Keep the prior active baseline when any refresh step fails.
- Tests should fail before their corresponding implementation tasks.
