# Tasks: OpenAPI Specification & Personal Access Tokens

**Input**: Design documents from `/specs/012-openapi-and-pat/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-endpoints.md, quickstart.md
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Database schema, new enum values, environment variables

- [x] T001 Add `TokenType`, `TokenStatus` enums and `PersonalAccessToken` model to `prisma/schema.prisma` per data-model.md
- [x] T002 Add `CliAuthCode` model to `prisma/schema.prisma` per data-model.md
- [x] T003 Add new `AuditAction` values (`PAT_CREATED`, `PAT_REVOKED`, `PAT_RENEWED`, `PAT_DELETED`, `CLI_LOGIN_COMPLETED`) to `prisma/schema.prisma`
- [x] T004 Mirror all schema changes (T001-T003) to `prisma/schema.postgres.prisma`
- [x] T005 Run SQLite migration (`pnpm run prisma:migrate`) and regenerate Prisma client (`pnpm run prisma:generate`)
- [x] T006 Run PostgreSQL migration (`pnpm run prisma:migrate:postgres`)
- [x] T007 Add `PAT_TOKEN_PREFIX`, `PAT_DEFAULT_EXPIRY_DAYS`, `CLI_TOKEN_DEFAULT_EXPIRY_DAYS`, `PAT_MAX_ACTIVE_PER_USER` to `.env.example` with defaults

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Token service and auth middleware that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Create token service in `src/services/api/tokens.ts` with functions: `generateToken(prefix)`, `hashToken(tokenValue)`, `createToken(userId, name, expiresInDays, type)`, `validateToken(tokenValue)` returning user, `listTokens(userId, showAll)`, `revokeToken(tokenId, userId)`, `renewToken(tokenId, userId, expiresInDays)`, `deleteToken(tokenId, userId)`, `countActiveTokens(userId)`. Use `crypto.randomBytes(32)` and `crypto.createHash('sha256')`. Read prefix from `PAT_TOKEN_PREFIX` env var.
- [x] T009 Create token auth middleware in `src/lib/token-auth.ts` with `resolveTokenUser(request)` that checks `Authorization: Bearer` then `X-API-Key` headers, calls `validateToken()`, checks user status (reject INACTIVE/PENDING_APPROVAL), and updates `lastUsedAt` asynchronously (fire-and-forget)
- [x] T010 Integrate token auth fallback into `src/services/api/route-context.ts`: modify `requireRouteUser()` to call `resolveTokenUser(request)` when `getSessionUser()` returns null. Pass the `Request` object through.
- [x] T011 Update `src/services/api/types.ts` to pass `Request` through `RouteUserResult` chain if needed by the middleware integration

**Checkpoint**: PAT authentication works for all existing API routes via Bearer/X-API-Key headers

---

## Phase 3: User Story 1 - Create and Use a Personal Access Token (Priority: P1) 🎯 MVP

**Goal**: Users can create PATs and use them to authenticate API requests

**Independent Test**: Create a PAT in the UI, call `/api/users` with Bearer header, verify response matches permissions

### Implementation for User Story 1

- [x] T012 [US1] Create `POST /api/tokens` route in `src/app/api/tokens/route.ts` — session-only auth, validate name (1-100 chars, unique per user) and expiresInDays (7/30/60/90/180/365), enforce active token limit (default 10), call `createToken()`, return token value once. Add audit entry `PAT_CREATED`.
- [x] T013 [US1] Create `GET /api/tokens` route in `src/app/api/tokens/route.ts` — session or PAT auth, call `listTokens()` with `showAll` query param, return token list (never include tokenHash or tokenValue)
- [x] T014 [P] [US1] Add i18n translation keys for token management UI to all 5 locale files in `src/i18n/messages/{en,de,es,fr,pt}.json` — namespace `tokens` with keys for: page title, create button, token name label, expiration label, expiration options, copy token message, token list headers, empty state, status labels, error messages
- [x] T015 [US1] Create `src/components/tokens/create-token-dialog.tsx` — form with name input and expiration dropdown (7d/30d/60d/90d/180d/1y), submit calls POST /api/tokens, displays token value once with copy button, uses i18n keys
- [x] T016 [US1] Create `src/components/tokens/token-value-display.tsx` — displays the one-time token value with copy-to-clipboard button and warning that it won't be shown again, uses i18n keys
- [x] T017 [US1] Create `src/components/tokens/token-list.tsx` — table showing name, prefix, type, status, expiration, last used, creation date; responsive (mobile-friendly); uses i18n keys; supports dark mode
- [x] T018 [US1] Create PAT management page at `src/app/(app)/settings/tokens/page.tsx` — server component, requires session auth, renders token-list and create-token-dialog, uses i18n
- [x] T019 [US1] Add navigation link to token management page in user settings/profile area
- [x] T019a [US1] Create unit tests in `tests/unit/token-service.test.ts` — test generateToken, hashToken, createToken, validateToken, listTokens, countActiveTokens. Cover: valid creation, duplicate name rejection, token limit enforcement, expired token rejection, inactive user rejection.
- [x] T019b [US1] Create integration tests in `tests/integration/token-api.test.ts` — test POST /api/tokens (valid, duplicate name, limit reached), GET /api/tokens (list, showAll filter), Bearer auth on existing endpoints (valid token, expired, revoked, wrong role).

**Checkpoint**: Users can create PATs via UI, copy the token value, and authenticate API requests with `Authorization: Bearer <token>`

---

## Phase 4: User Story 2 - Manage Personal Access Tokens (Priority: P1)

**Goal**: Users can revoke, renew, and delete tokens; see token status and history

**Independent Test**: Create tokens, revoke one (verify 401 but visible), renew another (verify new value works, old doesn't), delete one (verify gone from list)

### Implementation for User Story 2

- [x] T020 [US2] Create `POST /api/tokens/[id]/revoke` route in `src/app/api/tokens/[id]/revoke/route.ts` — session-only, verify token ownership, set status to REVOKED with revokedAt timestamp, add audit entry `PAT_REVOKED`
- [x] T021 [US2] Create `POST /api/tokens/[id]/renew` route in `src/app/api/tokens/[id]/renew/route.ts` — session-only, verify token ownership, reject if revoked, generate new token value, update hash/prefix/expiresAt/renewalCount, return new value once, add audit entry `PAT_RENEWED`
- [x] T022 [US2] Create `DELETE /api/tokens/[id]` route in `src/app/api/tokens/[id]/route.ts` — session-only, verify token ownership, hard delete, add audit entry `PAT_DELETED`
- [x] T023 [US2] Add revoke, renew, and delete action buttons to `src/components/tokens/token-list.tsx` — revoke button (active tokens only), renew button (active tokens only, shows new value), delete button (all tokens), confirmation dialogs, uses i18n keys
- [x] T024 [US2] Add "show all" toggle to `src/components/tokens/token-list.tsx` to reveal tokens revoked/expired >90 days ago (auto-hidden by default), uses i18n keys
- [x] T025 [US2] Add status badges (active/revoked/expired) and revocation date display to `src/components/tokens/token-list.tsx`, uses i18n keys
- [x] T025a [US2] Add integration tests to `tests/integration/token-api.test.ts` — test POST revoke (success, already revoked, not owned), POST renew (success, revoked token rejected, new value works, old value fails), DELETE (success, not found).

**Checkpoint**: Full token lifecycle works — create, use, revoke (visible with status), renew (new value), delete (gone)

---

## Phase 5: User Story 3 - Browse API Documentation (Priority: P2)

**Goal**: Developers can browse all API endpoints with schemas and auth requirements

**Independent Test**: Navigate to docs page, verify all endpoint groups listed with correct methods and descriptions

### Implementation for User Story 3

- [x] T026 [US3] Write OpenAPI 3.1 YAML specification at `public/openapi.yaml` documenting all existing endpoints (auth, users, audit, background-jobs, health, locale) plus new token and cli-auth endpoints, with request/response schemas, auth requirements, and error responses
- [x] T027 [US3] Create `GET /api/openapi` route in `src/app/api/openapi/route.ts` — any authenticated user, read `openapi.yaml`, inject configured base path into `servers` section, serve with `Content-Type: application/yaml`
- [x] T028 [US3] Create API documentation page at `src/app/(app)/docs/api/page.tsx` — server component, requires session auth, embeds Swagger UI loading the OpenAPI spec from `/api/openapi`, uses i18n for page title
- [x] T029 [P] [US3] Add i18n translation keys for API docs page to all 5 locale files — namespace `apiDocs` with keys for page title, description
- [x] T030 [US3] Add navigation link to API docs page in the app navigation
- [x] T030a [US3] Create integration test in `tests/integration/openapi.test.ts` — test GET /api/openapi returns valid YAML with correct Content-Type, base path injected, all endpoint groups present.
- [x] T030b [US3] Create E2E test in `tests/e2e/api-docs.spec.ts` — verify docs page loads, Swagger UI renders, endpoint groups visible.

**Checkpoint**: All API endpoints are browsable via Swagger UI at `/docs/api`, base path is correctly reflected

---

## Phase 6: User Story 4 - CLI Browser Login Flow (Priority: P2)

**Goal**: Server-side support for CLI browser login via localhost callback with auth code exchange

**Independent Test**: Initiate auth request, complete browser login, exchange code for token, verify token authenticates

### Implementation for User Story 4

- [x] T031 [US4] Create CLI auth service in `src/services/api/cli-auth.ts` with functions: `createAuthCode(callbackUrl, state)`, `bindAuthCodeToUser(codeId, userId)`, `exchangeAuthCode(code, state)` returning token, `cleanupExpiredCodes()`. Auth codes expire after 60 seconds, are single-use, and validate state parameter.
- [x] T032 [US4] Create `GET /api/cli-auth/authorize` route in `src/app/api/cli-auth/authorize/route.ts` — public endpoint, validate `callback_url` (must be localhost/127.0.0.1), validate `state` param, create CliAuthCode, redirect to login page with return URL pointing to `/cli-login`
- [x] T033 [US4] Create `POST /api/cli-auth/token` route in `src/app/api/cli-auth/token/route.ts` — public endpoint, validate code and state, call `exchangeAuthCode()`, return token + user info. Token type is CLI_LOGIN with 30-day default expiry.
- [x] T034 [US4] Create CLI login landing page at `src/app/cli-login/page.tsx` — requires session, reads auth code ID from query params, binds user to auth code, generates authorization code, redirects browser to CLI's callback_url with code and state params. Shows success/error message briefly before redirect.
- [x] T035 [P] [US4] Add i18n translation keys for CLI login page to all 5 locale files — namespace `cliLogin` with keys for: redirecting message, success message, error message
- [x] T036 [US4] Ensure all cli-auth endpoints respect base path configuration per FR-022 — verify URLs in redirects include the configured base path
- [x] T036a [US4] Create integration tests in `tests/integration/cli-auth.test.ts` — test GET /api/cli-auth/authorize (valid redirect, non-localhost rejected, missing state rejected), POST /api/cli-auth/token (valid exchange, expired code, reused code, state mismatch).
- [x] T036b [US4] Verify Azure SSO compatibility with CLI browser login flow per FR-023 — confirm that when a user authenticates via Azure SSO during the CLI flow, the server correctly redirects to the CLI's localhost callback with the auth code. No Entra app registration changes needed.

**Checkpoint**: A client can initiate browser login at `/api/cli-auth/authorize`, user authenticates (local or SSO), and the client receives a valid token via localhost callback

---

## Phase 7: User Story 5 - Authenticate via API Key Header (Priority: P3)

**Goal**: X-API-Key header support as alternative to Bearer token

**Independent Test**: Send request with `X-API-Key: <token>`, verify identical response to Bearer auth

### Implementation for User Story 5

- [x] T037 [US5] Verify `X-API-Key` header support already works from T009 (token-auth middleware checks both headers). If not, add X-API-Key fallback in `src/lib/token-auth.ts`. Verify Bearer takes precedence when both are present.

**Checkpoint**: API requests work with both `Authorization: Bearer` and `X-API-Key` headers

---

## Phase 8: User Story 6 - Admin Manages All Tokens (Priority: P3)

**Goal**: Platform admins can view, revoke, and delete tokens across all users

**Independent Test**: Login as admin, view all tokens, revoke another user's token, verify it stops working

### Implementation for User Story 6

- [x] T038 [US6] Create `GET /api/admin/tokens` route in `src/app/api/admin/tokens/route.ts` — requires PLATFORM_ADMIN role, list all tokens across all users with user info (name, email), support `showAll` and `userId` query params
- [x] T039 [US6] Create `POST /api/admin/tokens/[id]/revoke` route in `src/app/api/admin/tokens/[id]/revoke/route.ts` — requires PLATFORM_ADMIN, revoke any user's token, add audit entry
- [x] T040 [US6] Create `DELETE /api/admin/tokens/[id]` route in `src/app/api/admin/tokens/[id]/route.ts` — requires PLATFORM_ADMIN, delete any user's token, add audit entry
- [x] T041 [P] [US6] Add i18n translation keys for admin token management to all 5 locale files — namespace `adminTokens` with keys for page title, user column, filter by user
- [x] T042 [US6] Create admin token management page at `src/app/(app)/admin/tokens/page.tsx` — requires PLATFORM_ADMIN, shows all tokens with owner info, revoke/delete actions, user filter, show-all toggle, uses i18n
- [x] T043 [US6] Add navigation link to admin token management in admin area navigation
- [x] T043a [US6] Add integration tests to `tests/integration/token-api.test.ts` — test admin GET /api/admin/tokens (lists all users' tokens, userId filter), admin POST revoke (other user's token), admin DELETE (other user's token), non-admin rejected with 403.

**Checkpoint**: Admin can see all users' tokens, revoke/delete them, and revoked tokens immediately stop authenticating

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validation, security, cleanup

- [x] T044 Update OpenAPI spec at `public/openapi.yaml` to include all new token and cli-auth endpoints added in Phases 3-8
- [x] T045 Add toast notifications for all token operations (create, revoke, renew, delete) in token management UI components per constitution VIII (3-second display)
- [x] T046 Verify all token management pages are responsive on mobile viewports per constitution X — test token-list table, create dialog, admin page
- [x] T047 Verify dark mode works for all new token management UI components
- [x] T047a Create E2E test in `tests/e2e/token-management.spec.ts` — test full token lifecycle via UI: create token, copy value, verify token list shows it, revoke it, verify status badge, renew another, delete one.
- [x] T048 Run `pnpm run validate` (typecheck + lint + duplication check + semgrep + unit tests) and fix any issues
- [x] T049 Update `CONTINUE.md` and `CONTINUE_LOG.md` with feature completion status
- [x] T049a Update `ACTIVE_SPECS.md` — add spec 012 entry at start of implementation; remove entry when all tasks are complete per constitution VI

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schema must be migrated)
- **User Stories (Phase 3-8)**: All depend on Phase 2 (token service + auth middleware)
  - US1 + US2 can proceed in parallel (but US2 extends US1's UI components)
  - US3 can proceed independently (no dependency on US1/US2)
  - US4 can proceed independently
  - US5 is a verification task (likely already done in Phase 2)
  - US6 depends on US1/US2 for token CRUD API routes
- **Polish (Phase 9)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies
- **US2 (P1)**: After Phase 2 — extends US1's UI components but API routes are independent
- **US3 (P2)**: After Phase 2 — fully independent
- **US4 (P2)**: After Phase 2 — fully independent
- **US5 (P3)**: After Phase 2 — verification of T009
- **US6 (P3)**: After Phase 2 — API routes independent, UI independent. Best after US1/US2 for shared component patterns

### Within Each User Story

- API routes before UI components
- Service functions before routes (done in Phase 2)
- i18n keys before/parallel with UI components
- Core implementation before integration

### Parallel Opportunities

- T001-T004: Schema changes in parallel (different files for SQLite/Postgres)
- T014, T015, T016, T017: i18n keys and UI components in parallel
- T026-T030: OpenAPI spec and docs page components in parallel
- T031-T036: CLI auth service and routes in parallel with i18n
- T038-T043: Admin API and admin UI in parallel

---

## Parallel Example: User Story 1

```text
# After Phase 2 is complete, launch in parallel:
T014 [P] Add i18n keys to all 5 locale files
T015 [P] Create create-token-dialog component (can stub i18n initially)

# Then sequentially:
T012 POST /api/tokens route
T013 GET /api/tokens route
T016 token-value-display component
T017 token-list component
T018 settings/tokens page
T019 navigation link
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (schema + env vars)
2. Complete Phase 2: Foundational (token service + auth middleware)
3. Complete Phase 3: US1 — create and use PATs
4. **STOP and VALIDATE**: Create a PAT, use it with curl to call an existing endpoint
5. Complete Phase 4: US2 — revoke, renew, delete
6. **STOP and VALIDATE**: Full token lifecycle works

### Incremental Delivery

1. Setup + Foundational → PAT auth works for all existing routes
2. US1 → Users can create and use PATs (MVP!)
3. US2 → Users can manage token lifecycle
4. US3 → API docs browsable
5. US4 → CLI browser login flow works
6. US5 → X-API-Key header support verified
7. US6 → Admin token oversight
8. Polish → Responsive, dark mode, validation pass

---

## Notes

- Token creation is session-only (PATs cannot create PATs) per spec assumption
- Expired status is derived from `expiresAt < now()`, not stored in DB
- `lastUsedAt` is updated fire-and-forget (not blocking request) per research.md
- Token prefix is configurable via `PAT_TOKEN_PREFIX` env var per clarification
- All UI text must use next-intl keys per constitution IX
- All new pages must be responsive per constitution X
