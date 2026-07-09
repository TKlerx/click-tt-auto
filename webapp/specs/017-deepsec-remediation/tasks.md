# Tasks: DeepSec Remediation

**Input**: Design documents from `/specs/017-deepsec-remediation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/security-remediation-contract.md, quickstart.md
**Required Context**: Review `/CONTINUE.md` and `ACTIVE_SPECS.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Required by the feature spec and constitution. Write focused failing tests before implementation for each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Phase 1 closes HIGH/HIGH_BUG findings; Phase 2 accounting prepares MEDIUM/BUG remediation under the same spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and does not depend on incomplete tasks.
- **[Story]**: Maps to user stories in spec.md.
- Every task includes exact file paths.

## Phase 1: Setup

**Purpose**: Establish remediation baseline and keep continuity/spec tracking current.

- [x] T001 Review current handoff context in `CONTINUE.md` and open spec status in `ACTIVE_SPECS.md`
- [x] T002 [P] Capture current unresolved Phase 1 finding inventory from `.deepsec/findings-full-codex.json` into `specs/017-deepsec-remediation/phase-1-findings.md`
- [x] T003 [P] Verify `ACTIVE_SPECS.md` lists `017-deepsec-remediation` as in progress with next step "Phase 1 implementation"
- [x] T004 [P] Create a remediation evidence log skeleton in `specs/017-deepsec-remediation/remediation-evidence.md`

---

## Phase 2: Foundational

**Purpose**: Shared helpers and boundaries that block multiple user stories.

**Critical**: Complete this phase before user story implementation.

- [x] T005 [P] Define shared sensitive-key and token-pattern fixtures in `tests/unit/security/redaction-fixtures.test.ts`
- [x] T006 [P] Add shared release workflow validation fixture expectations in `tests/unit/security/release-workflow.test.ts`
- [x] T007 [P] Add shared audit bounds fixture expectations in `tests/unit/audit-trail.test.ts`
- [x] T008 [P] Add shared trusted-proxy rate-limit fixture expectations in `tests/unit/rate-limit.test.ts`
- [x] T009 Identify existing service entry points and document owner mapping in `specs/017-deepsec-remediation/remediation-evidence.md`

**Checkpoint**: Foundation ready; user story implementation can begin.

---

## Phase 3: User Story 1 - Protect Delegated Integration Secrets (Priority: P1)

**Goal**: Delegated Graph access tokens never appear in background job payloads, APIs, dashboards, logs, or stored historical job data.

**Independent Test**: Create and read Teams background jobs containing token-shaped values, then verify responses, dashboard data, logs, and stored payload cleanup contain only non-secret metadata.

### Tests for User Story 1

- [x] T010 [P] [US1] Add failing unit tests for background job API redaction in `tests/unit/background-jobs-route.test.ts`
- [x] T011 [P] [US1] Add failing unit tests for background jobs page redaction in `tests/unit/background-jobs-page.test.tsx`
- [x] T012 [P] [US1] Add failing unit tests proving Teams job creation stores non-secret metadata in `tests/unit/teams-service.test.ts`
- [x] T013 [P] [US1] Add failing integration tests for historical payload cleanup and read redaction in `tests/integration/teams-api.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Add background job payload sanitization helpers in `src/services/api/background-jobs.ts`
- [x] T015 [US1] Stop returning sensitive background job payload fields from `src/app/api/background-jobs/route.ts`
- [x] T016 [US1] Update Teams job creation to store delegated grant references and non-secret metadata only in `src/services/teams/service.ts`
- [x] T017 [US1] Redact sensitive payload fields in the dashboard query/render path in `src/app/(dashboard)/background-jobs/page.tsx`
- [x] T018 [US1] Add historical background job payload cleanup service in `src/services/api/background-jobs.ts`
- [x] T019 [US1] Add an explicit historical background job payload cleanup maintenance function in `src/services/api/background-jobs.ts`
- [x] T020 [US1] Update OpenAPI/background job response examples if payload shape changes in `public/openapi.yaml`
- [x] T021 [US1] Record US1 evidence, touched findings, and local test commands in `specs/017-deepsec-remediation/remediation-evidence.md`

**Checkpoint**: US1 independently passes tests and no delegated credential values appear in job read surfaces.

---

## Phase 4: User Story 2 - Preserve Administrative Access Invariants (Priority: P1)

**Goal**: Role and status changes always preserve at least one active platform administrator, including concurrent requests.

**Independent Test**: Simulate concurrent demotion/deactivation of final administrators through route and service paths and verify at least one active administrator remains.

### Tests for User Story 2

- [x] T022 [P] [US2] Add failing last-admin service concurrency tests in `tests/unit/auth/last-admin.test.ts`
- [x] T023 [P] [US2] Add failing route tests for concurrent deactivation in `tests/unit/auth/last-admin.test.ts`
- [x] T024 [P] [US2] Add failing route tests for concurrent role changes in `tests/unit/auth/last-admin.test.ts`
- [x] T025 [P] [US2] Add user-management E2E coverage for rejected final-admin changes in `tests/e2e/users/user-management.spec.ts`

### Implementation for User Story 2

- [x] T026 [US2] Implement atomic last-admin status protection in `src/lib/user-management.ts`
- [x] T027 [US2] Implement atomic last-admin role protection in `src/services/api/user-admin.ts`
- [x] T028 [US2] Wire deactivation route to the atomic invariant in `src/app/api/users/[id]/deactivate/route.ts`
- [x] T029 [US2] Wire role-change route to the atomic invariant in `src/app/api/users/[id]/role/route.ts`
- [x] T030 [US2] Ensure final-admin rejection messages are non-secret and localized through `src/i18n/messages/en.json`
- [x] T031 [P] [US2] Add matching final-admin rejection translation keys in `src/i18n/messages/de.json`
- [x] T032 [P] [US2] Add matching final-admin rejection translation keys in `src/i18n/messages/es.json`
- [x] T033 [P] [US2] Add matching final-admin rejection translation keys in `src/i18n/messages/fr.json`
- [x] T034 [P] [US2] Add matching final-admin rejection translation keys in `src/i18n/messages/pt.json`
- [x] T035 [US2] Record US2 evidence, touched findings, and local test commands in `specs/017-deepsec-remediation/remediation-evidence.md`

**Checkpoint**: US2 independently preserves at least one active platform administrator under concurrent changes.

---

## Phase 5: User Story 3 - Keep Security Controls Available Under Load (Priority: P2)

**Goal**: Login rate limits and audit list/export workflows remain bounded and predictable under malformed, broad, or hostile requests.

**Independent Test**: Exercise login rate limits with trusted and untrusted forwarded headers, and audit list/export with malformed or oversized parameters, then verify safe bounds and clear truncation/narrowing feedback.

### Tests for User Story 3

- [x] T036 [P] [US3] Add failing trusted-proxy and spoofed-header tests in `tests/unit/rate-limit.test.ts`
- [x] T037 [P] [US3] Add failing login route rate-limit bucket tests in `tests/unit/auth/login-route.test.ts`
- [x] T038 [P] [US3] Add failing audit list bounds tests in `tests/unit/services/api/audit-filters.test.ts`
- [x] T039 [P] [US3] Add failing audit export truncation tests in `tests/unit/audit-trail.test.ts`

### Implementation for User Story 3

- [x] T040 [US3] Harden forwarded client identity handling in `src/lib/rate-limit.ts`
- [x] T041 [US3] Ensure login route uses trusted-proxy-safe bucket keys in `src/app/api/auth/login/route.ts`
- [x] T042 [US3] Add safe pagination defaults and maxima for audit listing in `src/services/api/audit-filters.ts`
- [x] T043 [US3] Apply safe audit list bounds in `src/app/api/audit/route.ts`
- [x] T044 [US3] Add bounded audit export result handling in `src/lib/audit-export.ts`
- [x] T045 [US3] Return truncation or narrowing feedback from `src/app/api/audit/export/route.ts`
- [x] T046 [US3] Surface audit export truncation feedback in `src/components/audit/AuditExportButton.tsx`
- [x] T047 [US3] Add audit truncation translation key in `src/i18n/messages/en.json`
- [x] T048 [P] [US3] Add audit truncation translation key in `src/i18n/messages/de.json`
- [x] T049 [P] [US3] Add audit truncation translation key in `src/i18n/messages/es.json`
- [x] T050 [P] [US3] Add audit truncation translation key in `src/i18n/messages/fr.json`
- [x] T051 [P] [US3] Add audit truncation translation key in `src/i18n/messages/pt.json`
- [x] T052 [US3] Update audit export contract details in `public/openapi.yaml`
- [x] T053 [US3] Record US3 evidence, touched findings, and local test commands in `specs/017-deepsec-remediation/remediation-evidence.md`

**Checkpoint**: US3 independently keeps login and audit workflows bounded under hostile inputs.

---

## Phase 6: User Story 4 - Harden Release Publishing (Priority: P2)

**Goal**: Release automation uses immutable approved versions and grants write permissions only to publishing.

**Independent Test**: Review the release workflow and run workflow validation proving validation/build work is read-only and publishing uses pinned external automation/tooling.

### Tests for User Story 4

- [x] T054 [P] [US4] Add failing workflow pinning and permission tests in `tests/unit/security/release-workflow.test.ts`

### Implementation for User Story 4

- [x] T055 [US4] Split validation/build and publishing jobs in `.github/workflows/cli-release.yml`
- [x] T056 [US4] Pin `actions/checkout` to an immutable approved commit SHA in `.github/workflows/cli-release.yml`
- [x] T057 [US4] Pin `actions/setup-go` to an immutable approved commit SHA in `.github/workflows/cli-release.yml`
- [x] T058 [US4] Pin `goreleaser/goreleaser-action` to an immutable approved commit SHA in `.github/workflows/cli-release.yml`
- [x] T059 [US4] Replace GoReleaser `latest` with an explicit approved version in `.github/workflows/cli-release.yml`
- [x] T060 [US4] Restrict repository write permissions to the publishing job in `.github/workflows/cli-release.yml`
- [x] T061 [US4] Run and record release workflow validation or GoReleaser dry-run evidence in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T062 [US4] Document release workflow pin update procedure in `docs/security/actions.md`
- [x] T063 [US4] Record US4 evidence, touched findings, and local validation in `specs/017-deepsec-remediation/remediation-evidence.md`

**Checkpoint**: US4 independently validates release workflow pinning and write-permission isolation.

---

## Phase 7: User Story 5 - Keep Previous Auth Fixes Closed (Priority: P3)

**Goal**: Previously fixed mock SSO and CLI browser-login findings remain fixed while Phase 1 changes land.

**Independent Test**: Rerun relevant auth-flow tests and force revalidate stale auth findings if they reappear in DeepSec exports.

### Tests for User Story 5

- [x] T064 [P] [US5] Rerun and adjust mock SSO regression tests in `tests/e2e/auth/cli-sso-flow.spec.ts`
- [x] T065 [P] [US5] Rerun and adjust CLI auth integration tests in `tests/integration/cli-auth.test.ts`
- [x] T066 [P] [US5] Rerun and adjust mock SSO helper coverage in `tests/e2e/helpers/auth.ts`

### Implementation for User Story 5

- [x] T067 [US5] Preserve production mock SSO header-secret behavior in `src/app/api/auth/sso/azure/route.ts`
- [x] T068 [US5] Preserve explicit CLI approval and CSRF behavior in `src/app/api/cli-auth/approve/route.ts`
- [x] T069 [US5] Preserve atomic CLI auth-code exchange behavior in `src/services/api/cli-auth.ts`
- [x] T070 [US5] Record US5 evidence and auth revalidation commands in `specs/017-deepsec-remediation/remediation-evidence.md`

**Checkpoint**: US5 independently confirms previous auth fixes remain closed.

---

## Phase 8: Phase 1 Validation And DeepSec Evidence

**Purpose**: Prove Phase 1 closure with local tests and refreshed scanner evidence.

- [x] T071 Run `pnpm run typecheck` and record result in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T072 Run `pnpm run lint` and record result in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T073 Run `pnpm test` and record result in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T074 Run `pnpm vitest run tests/integration/cli-auth.test.ts tests/unit/background-jobs-route.test.ts tests/unit/auth/last-admin.test.ts tests/unit/rate-limit.test.ts tests/unit/audit-trail.test.ts tests/unit/security/release-workflow.test.ts` and record result in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T075 Run `pnpm playwright test tests/e2e/auth/cli-sso-flow.spec.ts tests/e2e/users/user-management.spec.ts` and record result in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T076 Refresh focused DeepSec scan/revalidation for Phase 1 touched paths from `.deepsec/` and export to `.deepsec/findings-full-codex.json`
- [x] T077 Update `.deepsec/findings-full-codex/` markdown export after Phase 1 revalidation
- [x] T078 Confirm no unresolved unactioned HIGH or HIGH_BUG findings remain and record run IDs in `specs/017-deepsec-remediation/remediation-evidence.md`
- [x] T079 Document any Phase 1 HIGH/HIGH_BUG accepted risks with owner, rationale, and review date in `specs/017-deepsec-remediation/remediation-evidence.md`

---

## Phase 9: Phase 2 MEDIUM/BUG Task Slice Preparation

**Purpose**: Keep the one-spec/two-priority decision actionable without blocking Phase 1.

- [x] T080 Create `specs/017-deepsec-remediation/phase-2-findings.md` listing every unresolved MEDIUM and BUG finding from `.deepsec/findings-full-codex.json`
- [x] T081 Classify each Phase 2 finding in `specs/017-deepsec-remediation/phase-2-findings.md` as fix, duplicate, accepted-risk candidate, or deferred-with-owner
- [x] T082 Add a Phase 2 task generation note to `specs/017-deepsec-remediation/remediation-evidence.md`

---

## Phase 10: Polish And Handoff

**Purpose**: Documentation, continuity, and final cleanup after selected task slice completion.

- [x] T083 [P] Update `docs/security/followups.md` with remaining accepted risks or Phase 2 deferrals
- [x] T084 [P] Update `docs/security/actions.md` with release workflow pin maintenance notes
- [x] T085 Update `CONTINUE.md` with Phase 1 completion status, DeepSec run IDs, and next recommended action
- [x] T086 Append Phase 1 completion summary to `CONTINUE_LOG.md`
- [x] T087 Update `ACTIVE_SPECS.md` to reflect current 017 status and next task slice
- [x] T088 Run `node scripts/update-spec-overview.mjs` and verify `specs/OVERVIEW.md` status

---

## Phase 11: Phase 2 Final MEDIUM Fix Slice

**Purpose**: Close the remaining actionable MEDIUM findings directly under this spec rather than creating a separate Phase 2 spec.

- [x] T089 [P] [US3] Add final login-flow tests proving inactive-account handling occurs only after password verification in `tests/unit/auth/login-route.test.ts`
- [x] T090 [US3] Move local password verification ahead of inactive-account handling in `src/app/api/auth/login/route.ts`
- [x] T091 [P] [US3] Add trusted-proxy shared-secret tests in `tests/unit/rate-limit.test.ts`
- [x] T092 [US3] Require an explicit trusted-proxy header secret before accepting forwarded client IP headers in `src/lib/rate-limit.ts`
- [x] T093 [P] [US1] Add inbound bounce tests proving message content cannot choose the bounced notification in `tests/integration/notification-inbound.test.ts`
- [x] T094 [US1] Correlate bounced notifications by provider message id only in `src/services/notifications/inbound.ts`
- [x] T095 Record final Phase 2 MEDIUM fix evidence, validation, and DeepSec revalidation run IDs in `specs/017-deepsec-remediation/remediation-evidence.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1.
- **US1 and US2**: Depend on Phase 2 and can proceed in parallel because they touch different feature surfaces.
- **US3 and US4**: Depend on Phase 2 and can proceed in parallel with each other after US1/US2 have stable shared evidence patterns.
- **US5**: Can run after Phase 2, but final validation should occur after US1-US4 are complete.
- **Phase 8 Validation**: Depends on selected Phase 1 user stories being complete.
- **Phase 9 Phase 2 Preparation**: Depends on refreshed export from Phase 8.
- **Phase 10 Polish**: Depends on the selected task slice being complete.

### User Story Dependencies

- **US1 Protect Delegated Integration Secrets**: MVP and highest security priority; no dependency on other stories after foundation.
- **US2 Preserve Administrative Access Invariants**: P1 and independent from US1 after foundation.
- **US3 Keep Security Controls Available Under Load**: P2 and independent from US1/US2, except final validation shares evidence format.
- **US4 Harden Release Publishing**: P2 and independent from runtime code changes.
- **US5 Keep Previous Auth Fixes Closed**: P3 regression story; should be checked after other Phase 1 changes to prove no regression.

### Test-First Ordering

- Write each story's tests before implementation.
- Verify each new test fails for the targeted existing behavior before applying the fix.
- Complete implementation tasks before updating evidence and running broad validation.

---

## Parallel Execution Examples

### User Story 1

```text
Task: T010 Add failing unit tests for background job API redaction in tests/unit/background-jobs-route.test.ts
Task: T011 Add failing unit tests for background jobs page redaction in tests/unit/background-jobs-page.test.tsx
Task: T012 Add failing unit tests proving Teams job creation stores non-secret metadata in tests/unit/teams-service.test.ts
Task: T013 Add failing integration tests for historical payload cleanup and read redaction in tests/integration/teams-api.test.ts
```

### User Story 2

```text
Task: T022 Add failing last-admin service concurrency tests in tests/unit/auth/last-admin.test.ts
Task: T025 Add user-management E2E coverage for rejected final-admin changes in tests/e2e/users/user-management.spec.ts
```

### User Story 3

```text
Task: T036 Add failing trusted-proxy and spoofed-header tests in tests/unit/rate-limit.test.ts
Task: T038 Add failing audit list bounds tests in tests/unit/services/api/audit-filters.test.ts
Task: T039 Add failing audit export truncation tests in tests/unit/audit-trail.test.ts
```

### User Story 4

```text
Task: T054 Add failing workflow pinning and permission tests in tests/unit/security/release-workflow.test.ts
Task: T061 Document release workflow pin update procedure in docs/security/actions.md
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 and validate delegated credential secrecy.
3. Stop and verify US1 independently before moving to the next story.

### Phase 1 Incremental Delivery

1. US1 closes delegated token exposure HIGH findings.
2. US2 closes last-admin HIGH_BUG findings.
3. US3 closes audit/rate-limit HIGH_BUG findings.
4. US4 closes release workflow HIGH finding.
5. US5 proves previous auth fixes stayed closed.
6. Phase 8 refreshes DeepSec evidence.

### Phase 2 Later Task Run

After Phase 1 is validated, use `phase-2-findings.md` and the refreshed export to generate or append the MEDIUM/BUG task slice under this same spec.

## Notes

- Keep tasks checked only when code, tests, and evidence for that task are complete.
- Do not mark a scanner finding fixed unless local tests and refreshed DeepSec evidence support it or accepted risk is documented.
- Avoid broad refactors outside the files listed in this task plan.

## Post-Merge Postgres E2E Default Hardening

- [x] T096 Add Postgres-first E2E database provisioning in `scripts/ensure-e2e-db.mjs`.
- [x] T097 Update Playwright global setup, teardown, and DB helpers to default to the Postgres E2E database while preserving explicit SQLite fallback.
- [x] T098 Disable implicit Playwright web server reuse for database-resetting E2E runs, with `E2E_REUSE_SERVER=1` as an explicit opt-in.
- [x] T099 Run the full Playwright suite against the default Postgres E2E path and record validation evidence.
- [x] T100 Move the default E2E Postgres URL to its own test database and keep Prisma Postgres adapter schema support for explicit schema URLs.
