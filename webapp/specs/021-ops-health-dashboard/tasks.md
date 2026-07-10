# Tasks: Ops Health Dashboard

**Input**: Design documents from `/specs/021-ops-health-dashboard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ops-health-dashboard.md, quickstart.md
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Required by project constitution and this feature plan. Write focused tests before implementation for each story and run the relevant slice after each implemented story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared files and test entry points for the ops dashboard feature.

- [x] T001 Create shared ops health module scaffold with exported placeholder types in `src/lib/ops-health.ts`
- [x] T002 [P] Create ops component directory scaffold with placeholder exports in `src/components/ops/index.ts`
- [x] T003 [P] Create admin ops route directory with placeholder page in `src/app/(dashboard)/admin/ops/page.tsx`
- [x] T004 [P] Create admin ops health API route scaffold in `src/app/api/admin/ops-health/route.ts`
- [x] T005 [P] Create focused unit test file scaffold in `tests/unit/ops-health.test.ts`
- [x] T006 [P] Create focused integration test file scaffold in `tests/integration/ops-health-api.test.ts`
- [x] T007 [P] Create focused e2e test file scaffold in `tests/e2e/ops-health/admin-ops-health.spec.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared contracts, sanitization, status aggregation, and i18n keys that all user stories depend on.

**CRITICAL**: No user story implementation should begin until this phase is complete.

- [x] T008 Define `HealthStatus`, `HealthCheckKey`, `EnvironmentIdentity`, `HealthCheckResult`, `HealthSnapshot`, and `DiagnosticSummary` types in `src/lib/ops-health.ts`
- [x] T009 Implement status aggregation rules for required vs optional checks in `src/lib/ops-health.ts`
- [x] T010 Implement secret-safe redaction and allowlisted diagnostic summary formatting helpers in `src/lib/ops-health.ts`
- [x] T011 [P] Add ops health translation namespace and nav label to `src/i18n/messages/en.json`
- [x] T012 [P] Add ops health translation namespace and nav label to `src/i18n/messages/de.json`
- [x] T013 [P] Add ops health translation namespace and nav label to `src/i18n/messages/es.json`
- [x] T014 [P] Add ops health translation namespace and nav label to `src/i18n/messages/fr.json`
- [x] T015 [P] Add ops health translation namespace and nav label to `src/i18n/messages/pt.json`
- [x] T016 Add unit tests for status aggregation and diagnostic redaction helpers in `tests/unit/ops-health.test.ts`

**Checkpoint**: Foundation ready. Shared snapshot types and safety helpers are test-covered.

---

## Phase 3: User Story 1 - Identify Running Environment (Priority: P1) MVP

**Goal**: An administrator can open the dashboard from admin navigation and identify the running environment/build within 15 seconds.

**Independent Test**: Sign in as a platform administrator, navigate to `/admin/ops`, and verify the page shows environment, version, revision, build id, build time, and snapshot timestamp with unknown labels for missing metadata.

### Tests for User Story 1

- [x] T017 [P] [US1] Add unit tests for environment identity mapping from app version metadata in `tests/unit/ops-health.test.ts`
- [x] T018 [P] [US1] Add integration tests for admin-only `/api/admin/ops-health` metadata response in `tests/integration/ops-health-api.test.ts`
- [x] T019 [P] [US1] Add e2e test for admin navigation to `/admin/ops` and visible build metadata in `tests/e2e/ops-health/admin-ops-health.spec.ts`

### Implementation for User Story 1

- [x] T020 [US1] Implement environment identity assembly from `getAppVersionInfo()` in `src/lib/ops-health.ts`
- [x] T021 [US1] Implement `GET /api/admin/ops-health` admin authorization and metadata-only snapshot response in `src/app/api/admin/ops-health/route.ts`
- [x] T022 [US1] Add admin-only Ops Health navigation item with `nav.opsHealth` in `src/components/ui/Navigation.tsx`
- [x] T023 [P] [US1] Implement status badge component for healthy/degraded/unknown/unavailable display in `src/components/ops/HealthStatusBadge.tsx`
- [x] T024 [US1] Implement initial ops dashboard page shell and metadata panel in `src/app/(dashboard)/admin/ops/page.tsx`
- [x] T025 [US1] Ensure non-admin users are redirected or denied from `/admin/ops` in `src/app/(dashboard)/admin/ops/page.tsx`
- [x] T026 [US1] Run and record focused US1 validation with `pnpm test -- tests/unit/ops-health.test.ts tests/integration/ops-health-api.test.ts` and relevant e2e command from `specs/021-ops-health-dashboard/quickstart.md`

**Checkpoint**: User Story 1 is independently functional and demonstrable.

---

## Phase 4: User Story 2 - Assess Operational Health (Priority: P2)

**Goal**: An administrator can see overall status plus runtime, database, configuration, worker, and deploy smoke health areas as a point-in-time snapshot.

**Independent Test**: Open the dashboard in healthy, degraded, and missing-evidence conditions and verify each health area reports healthy, degraded, unknown, or unavailable correctly without blocking the rest of the page.

### Tests for User Story 2

- [x] T027 [P] [US2] Add unit tests for runtime, database, configuration, worker, and deploy smoke health result assembly in `tests/unit/ops-health.test.ts`
- [x] T028 [P] [US2] Add integration tests for degraded database/configuration, optional unknown worker/smoke states, and safe fatal snapshot assembly errors in `tests/integration/ops-health-api.test.ts`
- [x] T029 [P] [US2] Add e2e test for manual refresh updating snapshot timestamp in `tests/e2e/ops-health/admin-ops-health.spec.ts`

### Implementation for User Story 2

- [x] T030 [US2] Implement runtime health check mapping from existing process health in `src/lib/ops-health.ts`
- [x] T031 [US2] Implement database health check mapping from existing database health in `src/lib/ops-health.ts`
- [x] T032 [US2] Implement configuration sanity check for authentication readiness, database URL ownership, runtime environment, and build metadata presence without exposing raw values in `src/lib/ops-health.ts`
- [x] T033 [US2] Implement recent worker evidence lookup from existing background jobs in `src/lib/ops-health.ts`
- [x] T034 [US2] Implement deploy smoke evidence as recorded-only unknown/unavailable status in `src/lib/ops-health.ts`
- [x] T035 [US2] Expand `/api/admin/ops-health` to return full health snapshot and degraded status details in `src/app/api/admin/ops-health/route.ts`
- [x] T036 [US2] Implement ops dashboard health check grid and overall status panel in `src/components/ops/OpsHealthDashboard.tsx`
- [x] T037 [US2] Add manual refresh behavior that fetches a new snapshot from `/api/admin/ops-health` in `src/components/ops/OpsHealthDashboard.tsx`
- [x] T038 [US2] Wire server-rendered initial snapshot into dashboard client refresh component in `src/app/(dashboard)/admin/ops/page.tsx`
- [x] T039 [US2] Run and record focused US2 validation with `pnpm test -- tests/unit/ops-health.test.ts tests/integration/ops-health-api.test.ts` and the manual-refresh e2e slice from `specs/021-ops-health-dashboard/quickstart.md`

**Checkpoint**: User Stories 1 and 2 are independently functional and demonstrable.

---

## Phase 5: User Story 3 - Share Safe Diagnostic Context (Priority: P3)

**Goal**: An administrator can copy a non-secret diagnostic summary for issues or incidents.

**Independent Test**: Copy the diagnostic summary from the dashboard and verify it contains environment/build identifiers and health states but no raw secrets, cookies, auth headers, private keys, passwords, or full connection strings.

### Tests for User Story 3

- [x] T040 [P] [US3] Add unit tests for diagnostic summary allowlist and forbidden secret patterns in `tests/unit/ops-health.test.ts`
- [x] T041 [P] [US3] Add integration test asserting `/api/admin/ops-health` diagnostic summary contains no raw secret-like values in `tests/integration/ops-health-api.test.ts`
- [x] T042 [P] [US3] Add e2e test for copy diagnostic summary action and toast-style success feedback in `tests/e2e/ops-health/admin-ops-health.spec.ts`

### Implementation for User Story 3

- [x] T043 [US3] Finalize diagnostic summary text generation from `HealthSnapshot` in `src/lib/ops-health.ts`
- [x] T044 [US3] Implement copy-to-clipboard client component with localized toast-style success and failure feedback in `src/components/ops/DiagnosticSummaryCopy.tsx`
- [x] T045 [US3] Add diagnostic summary panel to `src/components/ops/OpsHealthDashboard.tsx`
- [x] T046 [US3] Ensure copied diagnostic summary is rebuilt after manual refresh in `src/components/ops/OpsHealthDashboard.tsx`
- [x] T047 [US3] Run and record focused US3 validation with `pnpm test -- tests/unit/ops-health.test.ts tests/integration/ops-health-api.test.ts` and the copy e2e slice from `specs/021-ops-health-dashboard/quickstart.md`

**Checkpoint**: All user stories are independently functional and demonstrable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality, docs, continuity, and validation before PR.

- [x] T048 [P] Review responsive layout at mobile, tablet, and desktop widths using Playwright or browser screenshots for `/admin/ops`
- [x] T049 [P] Verify all new user-facing text uses next-intl keys across `src/app/(dashboard)/admin/ops/page.tsx` and `src/components/ops/`
- [x] T050 [P] Update `specs/021-ops-health-dashboard/quickstart.md` with any implementation-specific validation notes discovered during build
- [x] T051 Update `ACTIVE_SPECS.md` to show implementation progress for `021-ops-health-dashboard`
- [x] T052 Update `CONTINUE.md` and append `CONTINUE_LOG.md` with implementation status and next action
- [x] T053 Run `pnpm run specs:overview:update` and verify `pnpm run specs:overview:check`
- [x] T054 Run focused validation `pnpm test -- tests/unit/ops-health.test.ts tests/integration/ops-health-api.test.ts`
- [x] T055 Run relevant e2e validation `pnpm test:e2e -- tests/e2e/ops-health/admin-ops-health.spec.ts`
- [x] T056 Run broader validation with `.\validate.ps1 quality` and full pre-merge validation with `.\validate.ps1 all`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundation; MVP scope.
- **User Story 2 (Phase 4)**: Depends on Foundation and can reuse US1 page/API structure.
- **User Story 3 (Phase 5)**: Depends on Foundation and benefits from US2 complete snapshot data.
- **Polish (Phase 6)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 Identify Running Environment**: MVP; no dependency on US2 or US3.
- **US2 Assess Operational Health**: Can be developed after Foundation, but easiest after US1 creates route/page shell.
- **US3 Share Safe Diagnostic Context**: Can be developed after Foundation, but easiest after US2 finalizes full snapshot shape.

### Within Each User Story

- Write tests first and confirm they fail before implementation.
- Implement shared service logic before API/page wiring.
- Implement API/page data before UI rendering.
- Run focused validation at each checkpoint before moving to the next story.

## Parallel Opportunities

- Setup scaffolds T002-T007 can run in parallel after T001.
- Translation tasks T011-T015 can run in parallel.
- Story test tasks marked [P] can run in parallel within each story.
- Component tasks and service tasks in different files can run in parallel once shared types are stable.
- Polish checks T048-T050 can run in parallel.

## Parallel Example: User Story 1

```text
Task: "T017 [US1] Add unit tests for environment identity mapping from app version metadata in tests/unit/ops-health.test.ts"
Task: "T018 [US1] Add integration tests for admin-only /api/admin/ops-health metadata response in tests/integration/ops-health-api.test.ts"
Task: "T019 [US1] Add e2e test for admin navigation to /admin/ops and visible build metadata in tests/e2e/ops-health/admin-ops-health.spec.ts"
```

## Parallel Example: User Story 2

```text
Task: "T030 [US2] Implement runtime health check mapping from existing process health in src/lib/ops-health.ts"
Task: "T036 [US2] Implement ops dashboard health check grid and overall status panel in src/components/ops/OpsHealthDashboard.tsx"
Task: "T029 [US2] Add e2e test for manual refresh updating snapshot timestamp in tests/e2e/ops-health/admin-ops-health.spec.ts"
```

## Parallel Example: User Story 3

```text
Task: "T040 [US3] Add unit tests for diagnostic summary allowlist and forbidden secret patterns in tests/unit/ops-health.test.ts"
Task: "T044 [US3] Implement copy-to-clipboard client component with localized toast-style success and failure feedback in src/components/ops/DiagnosticSummaryCopy.tsx"
Task: "T041 [US3] Add integration test asserting /api/admin/ops-health diagnostic summary contains no raw secret-like values in tests/integration/ops-health-api.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate: unit/integration tests plus admin navigation e2e for metadata.
5. Demo `/admin/ops` with build metadata and admin-only access.

### Incremental Delivery

1. Foundation ready.
2. Add US1 metadata/admin navigation MVP.
3. Add US2 health snapshot and manual refresh.
4. Add US3 copyable safe diagnostics.
5. Complete polish, responsive review, and validation.

### Validation Rhythm

- Run focused tests after each story slice.
- Run `pnpm run specs:overview:check` after spec/task updates.
- Run `.\validate.ps1 quality` during polish and `.\validate.ps1 all` before PR/merge.
- Run additional broader validation if implementation changes reach shared auth, Prisma, or dashboard shell behavior.

## Notes

- [P] tasks use different files or can proceed without depending on incomplete task output.
- Tasks intentionally avoid adding new storage or dependencies.
- Optional worker and deploy smoke evidence must remain unknown/unavailable when no recent safe record exists.
- Diagnostic summary output must be allowlisted and redacted by default.
