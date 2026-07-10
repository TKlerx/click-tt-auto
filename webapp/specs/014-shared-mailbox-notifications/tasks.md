# Tasks: Shared Mailbox Notifications

**Input**: Design documents from `/specs/014-shared-mailbox-notifications/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mail-service.md, quickstart.md
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Tests are required. Phase 1 uses focused unit coverage for provider resolution and Graph behavior; later phases will add integration, worker, and UI coverage as notification workflows land.

**Organization**: Tasks are grouped by delivery phase and user story so the Graph-only foundation can stand on its own while the broader notification feature remains open.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Next.js application code lives in `src/`
- Unit and integration tests live in `tests/`
- Feature docs live in `docs/`
- Worker follow-up code will live under `worker/`

## Phase 1: Setup (Mail Foundation)

**Purpose**: Establish the reusable mail service surface and Graph-backed implementation.

- [x] T001 Create the mail abstraction module under `src/lib/mail/`
- [x] T002 [P] Define provider-neutral mail types and the `MailClient` contract in `src/lib/mail/types.ts`
- [x] T003 [P] Implement provider resolution and configuration checks in `src/lib/mail/provider.ts`
- [x] T004 [P] Implement the Microsoft Graph mail provider in `src/lib/mail/graph.ts`
- [x] T005 Export the mail module surface from `src/lib/mail/index.ts`

---

## Phase 2: Foundational Validation and Docs

**Purpose**: Verify the abstraction works as a stable dependency for later notification features.

- [x] T006 [P] Add provider-resolution coverage in `tests/unit/mail-provider.test.ts`
- [x] T007 [P] Add Graph mail client coverage in `tests/unit/graph-mail.test.ts`
- [x] T008 Update operator/developer docs in `.env.example`, `README.md`, and `docs/mail.md`
- [x] T009 Run validation for the mail foundation with `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/unit/mail-provider.test.ts tests/unit/graph-mail.test.ts`, and `.\validate.ps1 all`

**Checkpoint**: The repository has a documented, tested, provider-neutral Graph mail foundation that other features can consume.

---

## Phase 3: User Story 1 - Automatic Event Notifications (Priority: P1)

**Goal**: Application events produce durable, localized notification emails without blocking the triggering action.

**Independent Test**: Trigger a supported event such as a role change, verify a notification record is queued, processed asynchronously, and reflected in delivery status.

### Tests for User Story 1

- [x] T010 [P] [US1] Add notification service unit coverage in `tests/unit/notifications/`
- [x] T011 [P] [US1] Add notification route/service integration coverage in `tests/integration/`
- [x] T012 [P] [US1] Add end-to-end coverage for an event-triggered notification flow in `tests/e2e/`

### Implementation for User Story 1

- [x] T013 [US1] Add persistent notification event and notification models in `prisma/schema.prisma` and `prisma/schema.postgres.prisma`
- [x] T014 [US1] Create notification delivery and retry services under `src/services/notifications/`
- [x] T015 [US1] Integrate the currently available key events (user created, role changed, user status changed) with notification creation in the relevant `src/services/api/` modules; scope assignment integration remains pending until that mutation flow exists in the starter
- [x] T016 [US1] Add localized email template rendering under `src/lib/mail/templates/`
- [x] T017 [US1] Queue asynchronous delivery using the existing background-job/worker patterns

**Checkpoint**: Core application events can generate and deliver localized notification emails via the shared mailbox without blocking the initiating action.

---

## Phase 4: User Story 2 - Notification Preferences and Management (Priority: P2)

**Goal**: Administrators can manage notification types and inspect delivery outcomes.

**Independent Test**: Toggle a notification type off, trigger the event, and verify that no email is sent while the log still reflects the decision.

### Tests for User Story 2

- [x] T018 [P] [US2] Add API/service tests for notification settings and log filtering in `tests/integration/`
- [x] T019 [P] [US2] Add UI coverage for notification settings and log views in `tests/e2e/`

### Implementation for User Story 2

- [x] T020 [US2] Add notification type configuration persistence and services under `prisma/` and `src/services/notifications/`
- [x] T021 [US2] Add admin notification log and settings routes under `src/app/api/notifications/`
- [x] T022 [US2] Add notification settings and log UI under `src/app/(dashboard)/` and supporting components under `src/components/`
- [x] T023 [US2] Add RBAC-aware navigation and i18n strings for notification management in `src/components/ui/Navigation.tsx` and `src/i18n/messages/*.json`

**Checkpoint**: PLATFORM_ADMIN users can manage notification behavior and inspect delivery history, with scoped visibility rules applied where required.

---

## Phase 5: User Story 3 - Receive and Process Incoming Emails (Priority: P3)

**Goal**: The system ingests inbound shared mailbox messages, stores them, and processes bounce/reference workflows.

**Independent Test**: Send a message to the shared mailbox, run the worker poll cycle, and verify the inbound message is persisted and processed correctly.

### Tests for User Story 3

- [x] T024 [P] [US3] Add worker and inbound-processing tests under `worker/tests/` and `tests/integration/`
- [x] T025 [P] [US3] Add regression coverage for bounce correlation and reference matching in `tests/unit/`

### Implementation for User Story 3

- [x] T026 [US3] Add inbound-email persistence models in `prisma/schema.prisma` and `prisma/schema.postgres.prisma`
- [x] T027 [US3] Implement shared mailbox polling and deduplication in the worker under `worker/src/`
- [x] T028 [US3] Add bounce/NDR correlation and notification status updates in `src/services/notifications/`
- [x] T029 [US3] Add reference-matching hooks for downstream application linkage in `src/services/notifications/` or a dedicated inbound module

**Checkpoint**: Inbound mailbox messages are polled, stored, and processed without duplicating or losing messages.

---

## Phase 6: Polish & Governance

**Purpose**: Keep spec tracking, continuity, and repo docs aligned with feature progress.

- [x] T030 [Governance] Add the missing implementation-spec package for feature 014 in `specs/014-shared-mailbox-notifications/`
- [x] T031 [Governance] Update `ACTIVE_SPECS.md`, `CONTINUE.md`, and `CONTINUE_LOG.md` to reflect that the Graph mail foundation is complete but the broader feature remains open
- [x] T032 [Governance] Remove feature 014 from `ACTIVE_SPECS.md` only when all remaining tasks are complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies. This is the implemented foundation.
- **Phase 2**: Depends on Phase 1 and is also complete.
- **Phase 3**: Depends on the mail foundation from Phases 1-2.
- **Phase 4**: Depends on Phase 3 because admin views need persisted notifications to inspect.
- **Phase 5**: Depends on Phase 3 for durable notification records and on the mail foundation for mailbox access.
- **Phase 6**: Runs throughout the feature lifecycle.

### User Story Dependencies

- **US1 (P1)**: First executable product slice after the foundation.
- **US2 (P2)**: Depends on US1 persistence and delivery state.
- **US3 (P3)**: Depends on the shared mailbox foundation and is most useful once US1 delivery tracking exists.

### Parallel Opportunities

- Phase 1 tasks `T002` through `T004` were safe to execute in parallel because they touched separate files.
- Phase 2 tasks `T006` and `T007` are parallel test tasks.
- In future work, the test tasks within each user story can run in parallel before implementation starts.

## Implementation Strategy

### Already Delivered

1. Build the provider-neutral mail surface in `src/lib/mail/`.
2. Implement the Graph mailbox transport for list/get/send.
3. Add focused tests and docs.

### Recommended Next Slice

1. Add durable notification models and a delivery service.
2. Wire one or two high-value events first, such as role changes and user creation.
3. Send through the existing mail abstraction rather than calling Graph directly.
4. Add admin visibility only after delivery state exists.

## Notes

- The current implementation is intentionally smaller than the full feature spec; it is the foundation for the broader notification product work.
- Every later phase should continue to route outbound mail through `createMailClient()` so provider concerns stay isolated.
