# Tasks: Logging Standardization

**Input**: Design documents from `/specs/019-logging-standardization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Required by the feature specification and constitution. Add or update tests before implementation for each story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on incomplete tasks
- **[Story]**: User story label, used only inside user story phases
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm current logging surface and define the implementation target files.

- [x] T001 Review existing app logger behavior and current test coverage in `src/lib/logger.ts` and `tests/unit/logger.test.ts`
- [x] T002 Review current request correlation and request logging behavior in `src/proxy.ts`
- [x] T003 [P] Review existing ad hoc production console calls in `src/lib/audit.ts`, `src/services/api/tokens.ts`, `src/services/notifications/service.ts`, and `src/services/teams/service.ts`
- [x] T004 [P] Review current worker logging and job lifecycle paths in `worker/src/starter_worker/main.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared logging semantics before story-specific implementation.

**CRITICAL**: No user story work should begin until this phase is complete.

- [x] T005 Update logger event API to emit an `event` field while preserving compatibility with existing callers in `src/lib/logger.ts`
- [x] T006 Extend logger metadata sanitization for actor identifiers, normalized sensitive key variants, nested arrays/objects, and oversized unknown metadata in `src/lib/logger.ts`
- [x] T007 [P] Add tests for event field shape, at least 10 sensitive key variants, actor ID allowance, email/display-name redaction, nested metadata, and log-emission failure safety in `tests/unit/logger.test.ts`
- [x] T008 [P] Add reusable request logging test scaffolding for `NextRequest`/`NextResponse` proxy behavior in `tests/unit/proxy-request-logging.test.ts`

**Checkpoint**: App logging primitives and tests are ready for user story implementation.

---

## Phase 3: User Story 1 - Consistent Application Logs (Priority: P1) MVP

**Goal**: Existing app-side operational failures use structured, redacted, searchable log events with component and correlation context.

**Independent Test**: Trigger representative app-side failure paths and request logging paths; verify JSON log entries include stable event names, component, safe context, request correlation when available, and no raw secrets, emails, display names, full URLs, or raw query strings.

### Tests for User Story 1

- [x] T009 [P] [US1] Add request logging disabled-by-default and opt-in completion tests in `tests/unit/proxy-request-logging.test.ts`
- [x] T010 [P] [US1] Add request path/query sanitization tests for raw URL and sensitive query exclusion in `tests/unit/proxy-request-logging.test.ts`
- [x] T011 [P] [US1] Add service logging tests for structured events replacing ad hoc console failures in `tests/unit/token-service.test.ts`, `tests/unit/notifications/notification-service.test.ts`, and `tests/unit/teams-service.test.ts`
- [x] T012 [P] [US1] Add audit-boundary regression test confirming operational logging changes do not replace audit persistence behavior in `tests/unit/audit.test.ts`
- [x] T013 [P] [US1] Add process-level failure logging tests for `observability.initialized`, `process.uncaught_exception`, and `process.unhandled_rejection` event shape in `tests/unit/instrumentation.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Update request logging to emit opt-in `http.request.completed` events with `requestId`, `method`, `path`, proxy-visible `status`, and proxy handling `durationMs` in `src/proxy.ts`
- [x] T015 [US1] Add request path and allowlisted/sanitized query helpers in `src/lib/logger.ts`
- [x] T016 [US1] Add or document request correlation context at touched service failure log call sites in `src/services/api/tokens.ts`, `src/services/notifications/service.ts`, and `src/services/teams/service.ts`
- [x] T017 [US1] Replace ad hoc token update failure logging with structured logger events in `src/services/api/tokens.ts`
- [x] T018 [US1] Replace ad hoc notification queue failure logging with structured logger events in `src/services/notifications/service.ts`
- [x] T019 [US1] Replace ad hoc Teams queue failure logging with structured logger events in `src/services/teams/service.ts`
- [x] T020 [US1] Replace audit write failure console output with a structured operational log while preserving audit persistence semantics in `src/lib/audit.ts`
- [x] T021 [US1] Verify existing process-level failure logging uses standard event shape and component metadata in `src/instrumentation.ts`
- [x] T022 [US1] Run focused app logging tests with `pnpm vitest run tests/unit/logger.test.ts tests/unit/proxy-request-logging.test.ts tests/unit/logging-conventions.test.ts tests/unit/audit.test.ts tests/unit/instrumentation.test.ts`

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Worker Log Parity (Priority: P2)

**Goal**: Worker job lifecycle logs use the same event naming, severity, component, job identity, attempt count, and safe metadata conventions as app logs.

**Independent Test**: Run worker job success and failure paths; verify structured JSON logs for job claimed/completed/failed include job identity, job type, attempt, component, severity, and sanitized errors/results.

### Tests for User Story 2

- [x] T023 [P] [US2] Add worker structured logger tests for JSON shape, sensitive key redaction, and nested metadata handling in `worker/tests/test_logging.py`
- [x] T024 [P] [US2] Add worker job lifecycle logging tests for claimed, completed, failed, stale requeue, and Teams poll scheduling events in `worker/tests/test_main.py`

### Implementation for User Story 2

- [x] T025 [US2] Add a Python structured logging helper matching the app contract in `worker/src/starter_worker/logging.py`
- [x] T026 [US2] Replace worker startup and stale requeue string logs with structured events in `worker/src/starter_worker/main.py`
- [x] T027 [US2] Replace worker job claimed/completed/failed string logs with structured lifecycle events and safe result summaries in `worker/src/starter_worker/main.py`
- [x] T028 [US2] Ensure Graph mail and Teams exception details do not log raw tokens, payload bodies, or full provider responses through worker lifecycle logs in `worker/src/starter_worker/graph_mail.py` and `worker/src/starter_worker/graph_teams.py`
- [x] T029 [US2] Run focused worker tests with `Push-Location worker; uv run pytest tests/test_logging.py tests/test_main.py; Pop-Location`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Logging Guidance And Guardrails (Priority: P3)

**Goal**: Developers have clear logging conventions and automated validation catches new ad hoc production logging.

**Independent Test**: Read logging guidance and run validation against an intentional ad hoc production console call; validation reports the file and remediation context while allowing scripts, tests, and logger sink output.

### Tests for User Story 3

- [x] T030 [P] [US3] Add validation tests for disallowed production `console.*` calls and allowed logger/script/test console usage in `tests/unit/logging-validation.test.ts`
- [x] T031 [P] [US3] Add worker validation tests for disallowed direct `print(...)` and unstructured worker job lifecycle logging in `tests/unit/logging-validation.test.ts`

### Implementation for User Story 3

- [x] T032 [US3] Add a production logging guard script for app and worker source paths in `scripts/check-logging-guard.mjs`
- [x] T033 [US3] Wire the logging guard into the validation flow in `package.json` and `validate.ps1`
- [x] T034 [US3] Document event naming, severity, required context, redaction, request logging, worker logging, audit-boundary guidance, one app request example, one background job example, and one redaction example in `docs/logging.md`
- [x] T035 [US3] Add a logging documentation link or short summary to `README.md`
- [x] T036 [US3] Run focused guardrail checks with `pnpm vitest run tests/unit/logging-validation.test.ts` and `node scripts/check-logging-guard.mjs`

**Checkpoint**: All user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency, validation, and handoff.

- [x] T037 [P] Reconcile final implementation with `specs/019-logging-standardization/contracts/logging-contract.md`
- [x] T038 [P] Reconcile final guard behavior with `specs/019-logging-standardization/contracts/validation-contract.md`
- [x] T039 Run quickstart validation commands from `specs/019-logging-standardization/quickstart.md`
- [x] T040 Run full project validation with `.\validate.ps1 all`
- [x] T041 Update `CONTINUE.md`, `CONTINUE_LOG.md`, and `ACTIVE_SPECS.md` after implementation state changes
- [x] T042 Run `pnpm run specs:overview:update` after task completion state changes through `scripts/update-spec-overview.mjs`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; MVP scope.
- **User Story 2 (Phase 4)**: Depends on Foundational; can proceed independently after P1 tests define shared contract, but recommended after US1.
- **User Story 3 (Phase 5)**: Depends on Foundational; recommended after US1/US2 so guardrails match final code paths.
- **Polish (Phase 6)**: Depends on selected user stories being complete.

### User Story Dependencies

- **US1 Consistent Application Logs**: Can start after Foundation; no dependency on US2/US3.
- **US2 Worker Log Parity**: Can start after Foundation; no dependency on US3.
- **US3 Guidance And Guardrails**: Should run after US1 and US2 implementation so validation allowlists and docs match the final runtime shape.

### Within Each User Story

- Write/update tests before implementation.
- Update shared helpers before replacing call sites.
- Run focused tests at each checkpoint.
- Preserve operational logging and audit persistence as separate responsibilities.

## Parallel Opportunities

- T003 and T004 can run in parallel during setup.
- T007 and T008 can run in parallel after T005/T006 scope is understood.
- US1 tests T009-T013 can run in parallel.
- US1 call-site replacements T017-T020 can run in parallel after T014-T016 are available.
- US2 tests T023-T024 can run in parallel.
- US3 tests T030-T031 can run in parallel.
- Polish contract reconciliation T037-T038 can run in parallel.

## Parallel Example: User Story 1

```text
Task: "T009 [US1] Add request logging disabled-by-default and opt-in completion tests in tests/unit/proxy-request-logging.test.ts"
Task: "T010 [US1] Add request path/query sanitization tests for raw URL and sensitive query exclusion in tests/unit/proxy-request-logging.test.ts"
Task: "T011 [US1] Add service logging tests for structured events replacing ad hoc console failures in tests/unit/logging-conventions.test.ts"
Task: "T012 [US1] Add audit-boundary regression test confirming operational logging changes do not replace audit persistence behavior in tests/unit/audit.test.ts"
Task: "T013 [US1] Add process-level failure logging tests for observability.initialized, process.uncaught_exception, and process.unhandled_rejection event shape in tests/unit/instrumentation.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "T023 [US2] Add worker structured logger tests for JSON shape, sensitive key redaction, and nested metadata handling in worker/tests/test_logging.py"
Task: "T024 [US2] Add worker job lifecycle logging tests for claimed, completed, failed, stale requeue, and Teams poll scheduling events in worker/tests/test_main.py"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup review.
2. Complete Phase 2 logger foundation.
3. Complete Phase 3 app logging MVP.
4. Stop and validate with the focused US1 test command.

### Incremental Delivery

1. Foundation: app logger event shape and sanitization tests.
2. US1: app request/service/audit operational logs.
3. US2: worker structured lifecycle logs.
4. US3: documentation and validation guardrails.
5. Polish: contract reconciliation and `.\validate.ps1 all`.

### Validation Rhythm

- Run focused tests after each story checkpoint.
- Run `.\validate.ps1 all` before considering the feature complete.
- Use `.\validate.ps1 full` only when e2e and supply-chain gates are needed before merge.
