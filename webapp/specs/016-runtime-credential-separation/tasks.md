# Tasks: Runtime Credential Separation

**Input**: Design documents from `/specs/016-runtime-credential-separation/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/runtime-credential-contract.md`
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Required. This feature changes production-style runtime configuration and must preserve app, worker, migration, and Docker behavior.

**Organization**: Tasks are grouped by user story so the database split can ship before integration-secret refinements.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task supports
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Add reviewable docs and fixtures before runtime behavior changes.

- [x] T001 Add runtime credential ownership documentation in `docs/runtime-credentials.md` based on `specs/016-runtime-credential-separation/contracts/runtime-credential-contract.md`
- [x] T002 [P] Add runtime credential separation notes to `docs/security/actions.md`
- [x] T003 [P] Add runtime credential separation follow-up summary to `docs/security/followups.md`
- [x] T004 Add `016-runtime-credential-separation` to `ACTIVE_SPECS.md`

---

## Phase 2: Foundational

**Purpose**: Define the configuration surface all stories use.

- [x] T005 Update `.env.example` with `APP_DATABASE_URL`, `WORKER_DATABASE_URL`, `MIGRATION_DATABASE_URL`, and local `DATABASE_URL` fallback guidance
- [x] T006 Update `.env.docker.example` with separate app, worker, and migration database URL examples
- [x] T007 Refactor `docker-compose.yml` environment anchors into common, app, worker, and migration-specific blocks
- [x] T008 Add production-style command guards in `docker-compose.yml` for the runtime-specific database URL variables
- [x] T009 Update `specs/base/runtime-and-ops.md` to describe the separated credential model

**Checkpoint**: The target env shape is visible before app and worker code changes.

---

## Phase 3: User Story 1 - Identify Runtime Credential Ownership (Priority: P1)

**Goal**: Operators can see which runtime owns each high-risk setting.

**Independent Test**: Review `docs/runtime-credentials.md` and confirm all database, SSO, Graph, Teams, worker, and seed settings in examples are classified.

### Tests for User Story 1

- [x] T010 [P] [US1] Add a static fixture for valid credential ownership in `scripts/testdata/runtime-credentials/valid.md`
- [x] T011 [P] [US1] Add a static fixture for missing owner in `scripts/testdata/runtime-credentials/missing-owner.md`

### Implementation for User Story 1

- [x] T012 [US1] Populate `docs/runtime-credentials.md` with current and target owners for `.env.example`, `.env.docker.example`, and `docker-compose.yml`
- [x] T013 [US1] Add initial `scripts/validate-runtime-credentials.ps1` checks for required owner, purpose, and runtime fields

**Checkpoint**: Credential ownership can be reviewed and statically checked.

---

## Phase 4: User Story 2 - Split Database Credentials By Runtime (Priority: P1)

**Goal**: App, worker, and migration flows can use distinct database URL variables.

**Independent Test**: Run local app tests, worker tests, and `docker compose config` using the separated env examples.

### Tests for User Story 2

- [x] T014 [P] [US2] Add TypeScript coverage for app database URL precedence in `tests/unit/db-config.test.ts`
- [x] T015 [P] [US2] Add Python worker config coverage for `WORKER_DATABASE_URL` precedence in `worker/tests/test_main.py`
- [x] T016 [P] [US2] Add validation fixture rejecting app exposure of migration database URL in `scripts/testdata/runtime-credentials/app-has-migration-url.md`

### Implementation for User Story 2

- [x] T017 [US2] Update `src/lib/db.ts` to prefer `APP_DATABASE_URL` for app runtime with `DATABASE_URL` fallback
- [x] T018 [US2] Update `src/lib/better-auth.ts` to use the same app database URL resolution as `src/lib/db.ts`
- [x] T019 [US2] Update `worker/src/starter_worker/config.py` to prefer `WORKER_DATABASE_URL` with local `DATABASE_URL` fallback
- [x] T020 [US2] Update migration service configuration in `docker-compose.yml` to use `MIGRATION_DATABASE_URL`
- [x] T021 [US2] Run `pnpm test`, `cd worker; uv run python -m unittest tests.test_main`, and `docker compose config`

**Checkpoint**: The main database privilege boundary is executable.

---

## Phase 5: User Story 3 - Separate Integration Secrets By Runtime (Priority: P2)

**Goal**: App-facing auth secrets and worker-only integration secrets are separated where practical.

**Independent Test**: Inspect Compose output and env docs to confirm each service receives only required integration secrets or a documented exception.

### Tests for User Story 3

- [x] T022 [P] [US3] Add validation fixture rejecting worker-only Graph secret in app runtime in `scripts/testdata/runtime-credentials/app-has-worker-graph-secret.md`
- [x] T023 [P] [US3] Add validation fixture accepting a documented shared Graph app-registration exception in `scripts/testdata/runtime-credentials/shared-graph-exception.md`

### Implementation for User Story 3

- [x] T024 [US3] Move worker-only Graph mail and Teams polling settings out of the app env block in `docker-compose.yml`
- [x] T025 [US3] Document SSO, Graph mail, and Teams credential ownership plus accepted small-deployment exceptions in `docs/runtime-credentials.md`
- [x] T026 [US3] Update `.env.example` and `.env.docker.example` comments to distinguish app SSO credentials from worker Graph credentials

**Checkpoint**: Integration-secret ownership is explicit and enforced at the Compose boundary where practical.

---

## Phase 6: User Story 4 - Prevent Credential Drift (Priority: P3)

**Goal**: Wrong-runtime credential exposure is caught before production-style deployment.

**Independent Test**: Run validation against valid and invalid fixtures and confirm expected pass/fail behavior.

### Tests for User Story 4

- [x] T027 [P] [US4] Add validation fixture for undocumented shared credential in `scripts/testdata/runtime-credentials/shared-without-exception.md`
- [x] T028 [P] [US4] Add validation fixture for expired credential exception in `scripts/testdata/runtime-credentials/expired-exception.md`

### Implementation for User Story 4

- [x] T029 [US4] Extend `scripts/validate-runtime-credentials.ps1` to reject wrong-runtime credentials and invalid exceptions
- [x] T030 [US4] Add `validate:runtime-credentials` script to `package.json`
- [x] T031 [US4] Wire runtime credential validation into `pnpm run validate` or `validate.ps1` after focused checks are stable
- [x] T032 [US4] Update `specs/016-runtime-credential-separation/quickstart.md` with final commands and expected evidence

**Checkpoint**: Credential boundaries are regression-checked.

---

## Final Phase: Polish

**Purpose**: Close docs and validation.

- [x] T033 [P] Update `README.md` deployment notes with the separated credential names
- [x] T034 [P] Update `worker/README.md` with `WORKER_DATABASE_URL` behavior
- [x] T035 Run `pnpm run typecheck`
- [x] T036 Run `pnpm run lint`
- [x] T037 Run `pnpm test`
- [x] T038 Run `cd worker; uv run python -m unittest tests.test_main`
- [x] T039 Run `docker compose config`
- [x] T040 Run `pnpm run specs:overview:update`
- [x] T041 Update `CONTINUE.md` and append final implementation notes to `CONTINUE_LOG.md`

## Dependencies & Execution Order

- **Setup** has no dependencies.
- **Foundational** depends on Setup and blocks all user stories.
- **US1** depends on Foundational docs.
- **US2** depends on Foundational env naming and is the MVP implementation slice.
- **US3** depends on US1 ownership docs and can proceed after the Compose env blocks exist.
- **US4** depends on US1 validation skeleton and should incorporate US2/US3 rules.
- **Polish** depends on the selected implementation scope.

## Implementation Strategy

1. Complete Setup and Foundational phases.
2. Complete US1 and US2 first to land the database separation MVP.
3. Validate app, worker, and Compose behavior.
4. Add US3 integration-secret separation if Compose/env impact is low risk.
5. Add US4 validation once the final ownership model is stable.
