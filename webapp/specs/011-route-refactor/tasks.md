# Tasks: API Route Refactor

**Input**: Design documents from `/specs/011-route-refactor/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Tests are required for this feature because `spec.md` mandates preserving existing route behavior and adding regression coverage where helper extraction adds risk.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single-project Next.js application at repository root
- Application code lives in `src/`
- Tests live in `tests/unit/` and `tests/e2e/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared service surface that the route refactor will use.

- [x] T001 Create the shared API service entrypoint in `src/services/api/index.ts`
- [x] T002 [P] Create shared route-service types in `src/services/api/types.ts`
- [x] T003 [P] Create service-level unit test scaffolding in `tests/unit/services/api/route-context.test.ts` and `tests/unit/services/api/audit-filters.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the reusable helpers and compatibility layers that all route refactors depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Implement authenticated and role-aware route context helpers in `src/services/api/route-context.ts`
- [x] T005 Implement managed-user loading and status-mutation helpers in `src/services/api/user-admin.ts`
- [x] T006 [P] Implement shared audit filter parsing utilities in `src/services/api/audit-filters.ts`
- [x] T007 [P] Implement background-job mapping and serialization helpers in `src/services/api/background-jobs.ts`
- [x] T008 Update compatibility wrappers in `src/lib/route-auth.ts` and `src/lib/user-management.ts`
- [x] T009 Update shared audit export helpers to consume the shared filter model in `src/lib/audit-export.ts`

**Checkpoint**: Foundation ready. The current starter can now refactor existing route families without changing API contracts.

---

## Phase 3: User Story 1 - Safer Route Changes (Priority: P1) MVP

**Goal**: Centralize repeated auth, access, managed-user, and route orchestration logic for the current API route families without changing behavior.

**Independent Test**: Refactor a representative set of existing authenticated route families to shared helpers, then verify the existing unit tests for those handlers still pass with unchanged status codes, payloads, and authorization outcomes.

### Tests for User Story 1

> **NOTE: Write these tests first, ensure they fail before implementation.**

- [x] T010 [P] [US1] Add shared route-context unit coverage in `tests/unit/services/api/route-context.test.ts`
- [x] T011 [P] [US1] Add shared user-admin helper regression coverage in `tests/unit/auth/create-user.test.ts` and `tests/unit/auth/last-admin.test.ts`
- [x] T012 [P] [US1] Add route-regression coverage for list and export flows in `tests/unit/users-status-filter.test.ts`, `tests/unit/audit-trail.test.ts`, and `tests/unit/background-jobs-route.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Refactor authenticated user list and create handlers in `src/app/api/users/route.ts`
- [x] T014 [US1] Refactor the self-service theme handler in `src/app/api/users/[id]/theme/route.ts`
- [x] T015 [US1] Refactor approve, deactivate, and reactivate handlers in `src/app/api/users/[id]/approve/route.ts`, `src/app/api/users/[id]/deactivate/route.ts`, and `src/app/api/users/[id]/reactivate/route.ts`
- [x] T016 [US1] Refactor the role mutation handler in `src/app/api/users/[id]/role/route.ts`
- [x] T017 [US1] Refactor audit list and export handlers in `src/app/api/audit/route.ts` and `src/app/api/audit/export/route.ts`
- [x] T018 [US1] Refactor background job list and create handlers in `src/app/api/background-jobs/route.ts`
- [x] T019 [US1] Refactor authenticated auth handlers in `src/app/api/auth/change-password/route.ts`, `src/app/api/auth/logout/route.ts`, and `src/app/api/auth/session/route.ts`

**Checkpoint**: User Story 1 is complete when the current starter's authenticated route families share reusable helpers and all covered route tests pass unchanged.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and handoff updates that apply across the implemented work.

- [x] T020 [P] Update route duplication policy and deferred-scope notes in `specs/011-route-refactor/contracts/api-invariants.md` and `specs/011-route-refactor/contracts/service-boundaries.md`
- [x] T021 Run refactor regression checks with `validate.ps1`, `tests/unit/services/api/route-context.test.ts`, and `tests/unit/audit-trail.test.ts`
- [x] T022 [Governance] Update project continuity and spec tracking in `CONTINUE.md`, `CONTINUE_LOG.md`, and `ACTIVE_SPECS.md` to satisfy constitution handoff requirements

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. Blocks all executable story work.
- **User Story 1 (Phase 3)**: Depends on Foundational completion. This is the MVP and only implementation story in scope for this starter.
- **Polish (Phase 4)**: Depends on the executable story work being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependency on other stories.

### Within User Story 1

- Tests must be written and fail before implementation.
- Shared helpers must be in place before route files are switched over.
- User/admin route refactors should land before audit/background-job/auth cleanup so the core helper pattern is proven first.

### Parallel Opportunities

- `T002` and `T003` can run in parallel after `T001`.
- `T006` and `T007` can run in parallel after the service skeleton exists.
- `T010`, `T011`, and `T012` can run in parallel within User Story 1.
- After the foundational helpers land, `T017`, `T018`, and `T019` can proceed in parallel with the user-admin route refactors if the team is staffed for it.

---

## Parallel Example: User Story 1

```bash
# Launch the User Story 1 regression-test tasks together:
Task: "Add shared route-context unit coverage in tests/unit/services/api/route-context.test.ts"
Task: "Add shared user-admin helper regression coverage in tests/unit/auth/create-user.test.ts and tests/unit/auth/last-admin.test.ts"
Task: "Add route-regression coverage for list and export flows in tests/unit/users-status-filter.test.ts, tests/unit/audit-trail.test.ts, and tests/unit/background-jobs-route.test.ts"

# After the shared helpers are in place, split route refactors by family:
Task: "Refactor audit list and export handlers in src/app/api/audit/route.ts and src/app/api/audit/export/route.ts"
Task: "Refactor background job list and create handlers in src/app/api/background-jobs/route.ts"
Task: "Refactor authenticated auth handlers in src/app/api/auth/change-password/route.ts, src/app/api/auth/logout/route.ts, and src/app/api/auth/session/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate the refactored existing route families before touching any deferred future-domain work.

### Incremental Delivery

1. Build the shared service foundation.
2. Refactor the current user/admin, audit, background-job, and authenticated auth routes behind that foundation.
3. Validate duplication reduction and unchanged API behavior.
4. Leave US2 and US3 deferred until the repository contains the document/version and AI route families that those stories refer to.

### Parallel Team Strategy

1. One developer builds the shared helper layer in `src/services/api/`.
2. A second developer prepares the regression tests in `tests/unit/services/api/` and the affected route test files.
3. Once the foundational layer is merged, route families can be split across user/admin, audit/background-jobs, and authenticated auth handlers.

---

## Notes

- `[P]` tasks are safe parallel candidates because they touch separate files or route families.
- User Story 1 is the suggested MVP scope because it maps to the current repository.
- Future document-version and AI enqueue refactors are intentionally deferred and should be captured in separate specs when those route families exist in this starter or a downstream app.
- Every executable task above follows the required checklist format with checkbox, ID, optional parallel marker, story label when applicable, and file path.
