# Tasks: Deploy Smoke Verification

**Input**: Design documents from `/specs/020-deploy-smoke-verification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Required by the project constitution for every user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the smoke command shell and package entry point.

- [x] T001 Add `smoke:azure` script to `package.json`
- [x] T002 Create CLI wrapper in `scripts/run-azure-deploy-smoke.mjs`
- [x] T003 Create typed smoke command module skeleton in `scripts/azure-deploy-smoke.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared parsing, execution, reporting, and redaction used by all smoke stories.

- [x] T004 Implement CLI argument and environment parsing in `scripts/azure-deploy-smoke.ts`
- [x] T005 Implement sanitized report types and redaction helpers in `scripts/azure-deploy-smoke.ts`
- [x] T006 Implement injectable HTTP and Azure command runners in `scripts/azure-deploy-smoke.ts`

**Checkpoint**: Foundation ready; user story implementation can begin.

---

## Phase 3: User Story 1 - Verify The Deployed Application (Priority: P1) MVP

**Goal**: Operators can verify that the deployed app health endpoint is reachable and healthy.

**Independent Test**: Mock the health endpoint and confirm the smoke command passes on `status: ok` and fails on unavailable/degraded responses.

### Tests for User Story 1

- [x] T007 [P] [US1] Add app health smoke unit tests in `tests/unit/azure-deploy-smoke.test.ts`

### Implementation for User Story 1

- [x] T008 [US1] Implement base-path-aware app health URL construction in `scripts/azure-deploy-smoke.ts`
- [x] T009 [US1] Implement app health smoke check in `scripts/azure-deploy-smoke.ts`
- [x] T010 [US1] Run `pnpm test -- tests/unit/azure-deploy-smoke.test.ts`

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Verify Deployment Runtime State (Priority: P2)

**Goal**: Operators can verify migration completion, app revision health, and worker revision health.

**Independent Test**: Mock Azure CLI responses and confirm runtime smoke passes only when migration and both revision checks are healthy.

### Tests for User Story 2

- [x] T011 [P] [US2] Add migration and revision smoke unit tests in `tests/unit/azure-deploy-smoke.test.ts`

### Implementation for User Story 2

- [x] T012 [US2] Implement migration job execution lookup and success validation in `scripts/azure-deploy-smoke.ts`
- [x] T013 [US2] Implement Container App revision health validation in `scripts/azure-deploy-smoke.ts`
- [x] T014 [US2] Run `pnpm test -- tests/unit/azure-deploy-smoke.test.ts`

**Checkpoint**: User Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 - Preserve Operator Evidence (Priority: P3)

**Goal**: Operators and CI receive concise, sanitized, auditable smoke output.

**Independent Test**: Run the CLI in mocked success and failure modes and confirm exit codes plus sanitized human/JSON output.

### Tests for User Story 3

- [x] T015 [P] [US3] Add CLI output and exit-code tests in `tests/integration/azure-deploy-smoke-cli.test.ts`

### Implementation for User Story 3

- [x] T016 [US3] Implement human and JSON output rendering in `scripts/azure-deploy-smoke.ts`
- [x] T017 [US3] Wire smoke verification into `.github/workflows/deploy-azure.yml`
- [x] T018 [US3] Document local and CI usage in `docs/azure-deploy-smoke.md` and update `specs/018-opentofu-azure-infra/quickstart.md`
- [x] T019 [US3] Run `pnpm test -- tests/unit/azure-deploy-smoke.test.ts tests/integration/azure-deploy-smoke-cli.test.ts`

**Checkpoint**: All user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, tracking, and handoff.

- [x] T020 Refresh spec overview in `specs/OVERVIEW.md`
- [x] T021 Update `ACTIVE_SPECS.md`, `CONTINUE.md`, and `CONTINUE_LOG.md`
- [x] T022 Run `.\validate.ps1 all`
- [x] T023 Review git diff and prepare commit

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): No dependencies.
- Foundational (Phase 2): Depends on setup completion and blocks all user stories.
- User Story 1 (Phase 3): Depends on foundational phase.
- User Story 2 (Phase 4): Depends on foundational phase and can be tested without US1, but will normally follow MVP validation.
- User Story 3 (Phase 5): Depends on reporting primitives from foundational phase and check results from US1/US2.
- Polish (Phase 6): Depends on completed target user stories.

### Parallel Opportunities

- T007, T011, and T015 can be drafted independently once the skeleton exports are known.
- Documentation T018 can proceed after the CLI contract stabilizes.

## Implementation Strategy

### MVP First

1. Complete setup and foundational tasks.
2. Complete US1 app health smoke check.
3. Validate US1 with focused tests before adding Azure runtime checks.

### Incremental Delivery

1. Add app health smoke.
2. Add migration/revision runtime smoke.
3. Add CI wiring and operator evidence.
4. Run full validation before commit.
