# Tasks: Auth Security Hardening

**Input**: Design documents from `/specs/010-auth-security-hardening/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Included per constitution principle II (Test Coverage).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes and Prisma migration needed before any implementation

- [x] T001 Add `AUTH_PASSWORD_CHANGED` to `AuditAction` in `prisma/schema.prisma` and `prisma/schema.postgres.prisma`, add matching SQLite/Postgres migrations, and run `pnpm exec prisma generate`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared utilities that multiple user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create in-memory per-IP rate limiter utility in `src/lib/rate-limit.ts`, exporting `checkRateLimit(ip: string, endpoint: string)` and `getClientIp(request: Request)`
- [x] T003 Add `safeLogAudit` wrapper in `src/lib/audit.ts` to log-and-continue when audit persistence fails

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Protect Account Entry Points (Priority: P1)

**Goal**: Rate-limit login and change-password endpoints and harden proxy/origin trust so forwarded headers are only trusted when `AUTH_BASE_URL` is explicitly set.

**Independent Test**: Repeatedly attempt login and password-change actions; confirm the 6th attempt within 15 minutes returns HTTP 429 with `Retry-After`. Deploy without `AUTH_BASE_URL` and verify forwarded headers are ignored.

### Tests for User Story 1

- [x] T004 [P] [US1] Write unit tests for the rate limiter in `tests/unit/rate-limit.test.ts`
- [x] T005 [P] [US1] Write unit tests for proxy trust hardening in `tests/unit/azure-auth.test.ts`

### Implementation for User Story 1

- [x] T006 [P] [US1] Tighten `getExternalOrigin` in `src/lib/azure-auth.ts`
- [x] T007 [P] [US1] Set `trustedProxyHeaders` conditionally in `src/lib/better-auth.ts`
- [x] T008 [US1] Add rate limiting to `src/app/api/auth/login/route.ts`
- [x] T009 [US1] Add rate limiting to `src/app/api/auth/change-password/route.ts`

**Checkpoint**: Login and change-password endpoints are rate-limited; proxy trust is hardened.

---

## Phase 4: User Story 2 - Keep SSO Identity Safe And Predictable (Priority: P2)

**Goal**: Remove the unsigned `id_token` fallback so SSO sign-in fails closed when user identity cannot be verified. Gate mock SSO behind non-production environments.

**Independent Test**: Simulate Graph API userinfo failure and verify sign-in is denied. Set `NODE_ENV=production` with `E2E_MOCK_SSO=1` and verify mock SSO is unreachable.

### Tests for User Story 2

- [x] T010 [P] [US2] Write unit tests for SSO identity safety in `tests/unit/azure-auth-sso.test.ts`

### Implementation for User Story 2

- [x] T011 [US2] Remove the unsigned `id_token` fallback in `src/lib/azure-auth.ts`
- [x] T012 [US2] Gate mock SSO behind `NODE_ENV !== "production"` in `src/app/api/auth/sso/azure/route.ts`

**Checkpoint**: SSO identity resolution fails closed on unverifiable data; mock SSO cannot run in production.

---

## Phase 5: User Story 3 - Keep Admin Actions Auditable And Consistent (Priority: P3)

**Goal**: Validate user-status filter inputs, add audit trail entries for sensitive auth and user-admin actions, and enforce password complexity in the seed/setup flow.

**Independent Test**: Supply an invalid status filter and verify a 400 response. Perform login, password change, user creation, approval, deactivation, reactivation, and role change flows and verify audit records. Run seed with a weak password and verify rejection.

### Tests for User Story 3

- [x] T013 [P] [US3] Write unit tests for status-filter validation in `tests/unit/users-status-filter.test.ts`

### Implementation for User Story 3

- [x] T014 [US3] Validate the user-status filter in `src/app/api/users/route.ts`
- [x] T015 [P] [US3] Add audit logging to `src/app/api/auth/login/route.ts`
- [x] T016 [P] [US3] Add audit logging to `src/app/api/auth/logout/route.ts`
- [x] T017 [P] [US3] Add audit logging to `src/app/api/auth/change-password/route.ts`
- [x] T018 [P] [US3] Add audit logging to user creation in `src/app/api/users/route.ts`
- [x] T019 [P] [US3] Add audit logging to `src/app/api/users/[id]/approve/route.ts`
- [x] T020 [P] [US3] Add audit logging to `src/app/api/users/[id]/deactivate/route.ts`
- [x] T021 [P] [US3] Add audit logging to `src/app/api/users/[id]/reactivate/route.ts`
- [x] T022 [P] [US3] Add audit logging to `src/app/api/users/[id]/role/route.ts`
- [x] T023 [US3] Enforce password complexity in `prisma/seed.ts`

**Checkpoint**: Auth and user-admin actions produce audit entries; status filter rejects invalid values; seed enforces the password policy.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and project hygiene

- [x] T024 Run `pnpm run validate` and fix any issues
- [x] T025 Update `CONTINUE.md` and append to `CONTINUE_LOG.md` with the implementation summary
- [x] T026 Update `ACTIVE_SPECS.md` / tracking docs to reflect that this spec is complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1
- **User Stories (Phase 3-5)**: Depend on Phase 2 completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T002 and T003
- **User Story 2 (P2)**: Independent once planning is complete
- **User Story 3 (P3)**: Depends on T001 and T003; overlaps some files with US1 and was completed after those changes

### Parallel Opportunities

- T004 and T005
- T006 and T007
- T011 and T012
- T015 through T022 on distinct route files

---

## Implementation Notes

- The feature is implemented and validated.
- Verification completed with `pnpm exec prisma generate`, `pnpm run typecheck`, `pnpm test`, `pnpm run validate`, and `pnpm run build`.
- Remaining follow-up work, if any, should be tracked in a new numbered spec rather than reopening this one.
