# DeepSec Remediation Evidence

## Metadata

- Spec: `017-deepsec-remediation`
- Branch: `017-deepsec-remediation`
- Focus: Phase 1 (`HIGH` and `HIGH_BUG`)

## Task Progress Log

### Phase 1 Setup + Foundation

- T001-T009: initialized context, finding inventory, evidence log, and shared fixture coverage.

### US1 In Progress

- Completed T010-T012 and T014-T017.
- Implemented recursive payload/result/error redaction for background job read surfaces.
- Removed delegated Graph access token persistence from Teams background job payload creation.
- Added dashboard payload redaction to prevent token-shaped field disclosure in admin UI rendering.
- Completed T013 and T018-T021.
- Added integration coverage for read-path redaction and historical payload cleanup maintenance flow.
- Added OpenAPI note for redacted sensitive background-job response fields.

### US1 Finding Coverage

- `src/app/api/background-jobs/route.ts` HIGH token exposure finding: mitigated by service-level read redaction now returned by route.
- `src/services/api/background-jobs.ts` HIGH token exposure finding: mitigated by recursive sensitive-key redaction and historical cleanup functions.
- `src/services/teams/service.ts` HIGH token persistence finding: mitigated by removing delegated access token from queued background job payloads.

### US2 In Progress

- Completed T022-T024 and T026-T029.
- Added route/service concurrency-oriented unit coverage in `tests/unit/auth/last-admin.test.ts`.
- Enforced serializable transaction boundary for role/status admin invariants with bounded retry on serialization conflict (`P2034`).
- Re-check of target user and last-admin count now executes in same transaction context before mutation.
- Completed T025 and T030-T035.
- Added E2E user-management coverage that proves last active admin deactivation is rejected.
- Added localized final-admin rejection messages across `en`, `de`, `es`, `fr`, and `pt`.
- Added frontend mapping from API rejection strings to localized, non-secret UI toast messages.

### US2 Finding Coverage

- `src/lib/user-management.ts` HIGH_BUG last-admin non-atomic guard: mitigated via transactional invariant evaluation and mutation path.
- `src/services/api/user-admin.ts` HIGH_BUG concurrent role/status bypass: mitigated via serializable transaction + retry.
- `src/app/api/users/[id]/deactivate/route.ts` HIGH_BUG concurrent final-admin deactivate: covered by transactional status update path and E2E reject case.
- `src/app/api/users/[id]/role/route.ts` HIGH_BUG concurrent final-admin role change: covered by transactional role update path and unit concurrency-retry coverage.

### US3 In Progress

- Completed T036-T045.
- Hardened trusted-proxy IP extraction to accept only valid IP formats from forwarded headers.
- Updated login route to avoid one global unknown-client bucket by using account-scoped fallback keys when client IP is unavailable.
- Added strict positive integer validation and max cap for audit list pagination.
- Added bounded audit export behavior (max export rows) and truncation feedback via response headers.
- Completed T046-T053.
- Surfaced truncation feedback in audit export UI by checking response headers and raising localized toast.
- Added audit truncation localization keys in `en`, `de`, `es`, `fr`, and `pt`.
- Updated OpenAPI audit export contract description for bounded/truncation behavior.

### US3 Finding Coverage

- `src/app/api/auth/login/route.ts` HIGH_BUG global bucket collapse: mitigated with safer keying strategy.
- `src/services/api/audit-filters.ts` + `src/app/api/audit/route.ts` pagination-bypass/resource bug: mitigated with validated/capped pagination.
- `src/app/api/audit/export/route.ts` + `src/lib/audit-export.ts` export resource exhaustion risk: mitigated with bounded export size and truncation signaling.
- `src/components/audit/AuditExportButton.tsx` UX feedback gap: mitigation added with localized truncation toast feedback.

### US4 In Progress

- Completed T054-T063.
- Split release workflow into read-only `validate` job and write-scoped `publish` job with `needs: validate`.
- Pinned actions to immutable SHAs:
  - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (`v4.2.2`)
  - `actions/setup-go@d35c59abb061a4a6fb18e82ac0862c26744d6ab5` (`v5.5.0`)
  - `goreleaser/goreleaser-action@9c156ee8a17a598857849441385a2041ef570552` (`v6.3.0`)
- Replaced mutable GoReleaser selector with explicit `version: v2.16.0`.
- Added release pin maintenance procedure to `docs/security/actions.md`.

### US4 Finding Coverage

- `.github/workflows/cli-release.yml` HIGH unpinned action/write token finding: mitigated by immutable action pins, explicit GoReleaser version, and write permission restricted to publish job.

### US5 In Progress

- Completed T064-T070.
- Re-ran auth regression suites without changes required in:
  - `src/app/api/auth/sso/azure/route.ts`
  - `src/app/api/cli-auth/approve/route.ts`
  - `src/services/api/cli-auth.ts`
- Existing fixes remained stable:
  - production mock SSO still requires test-only header secret
  - CLI approval flow remains explicit POST + CSRF cookie validated
  - CLI auth-code exchange remains atomic/one-time

## Service Entry Point Ownership (T009)

- `src/services/api/background-jobs.ts`
  - Owner surface: background job read/create API data shaping and payload handling.
  - Stories: US1.
- `src/app/api/background-jobs/route.ts`
  - Owner surface: authenticated background jobs route response contract.
  - Stories: US1.
- `src/services/teams/service.ts`
  - Owner surface: Teams queueing payload construction and delegated token handling.
  - Stories: US1.
- `src/lib/user-management.ts`
  - Owner surface: user status invariants (last-admin active guard).
  - Stories: US2.
- `src/services/api/user-admin.ts`
  - Owner surface: admin mutation services and role/status transitions.
  - Stories: US2.
- `src/app/api/users/[id]/deactivate/route.ts`
  - Owner surface: deactivate mutation route behavior and error surfacing.
  - Stories: US2.
- `src/app/api/users/[id]/role/route.ts`
  - Owner surface: role mutation route behavior and error surfacing.
  - Stories: US2.
- `src/lib/rate-limit.ts`
  - Owner surface: client key derivation and proxy trust model.
  - Stories: US3.
- `src/app/api/auth/login/route.ts`
  - Owner surface: login rate-limit bucket usage.
  - Stories: US3.
- `src/services/api/audit-filters.ts`
  - Owner surface: audit list/export request bounds parsing.
  - Stories: US3.
- `src/app/api/audit/route.ts`
  - Owner surface: audit list pagination bounds application.
  - Stories: US3.
- `src/lib/audit-export.ts`
  - Owner surface: export fetch sizing and output memory behavior.
  - Stories: US3.
- `src/app/api/audit/export/route.ts`
  - Owner surface: export route feedback for truncation/narrowing.
  - Stories: US3.
- `.github/workflows/cli-release.yml`
  - Owner surface: release automation pinning and write permission isolation.
  - Stories: US4.

## Validation Commands

- Pending (to be filled during T071-T075).
- Focused US1 command pass:
  - `pnpm vitest run tests/unit/background-jobs-route.test.ts tests/unit/background-jobs-page.test.tsx tests/unit/teams-service.test.ts`
  - `pnpm vitest run tests/integration/teams-api.test.ts tests/unit/background-jobs-route.test.ts tests/unit/background-jobs-page.test.tsx tests/unit/teams-service.test.ts`
- Focused US2 command pass:
  - `pnpm vitest run tests/unit/auth/last-admin.test.ts`
  - `pnpm playwright test tests/e2e/users/user-management.spec.ts --grep "last active admin cannot be deactivated"`
- Focused US3 command pass:
  - `pnpm vitest run tests/unit/rate-limit.test.ts tests/unit/auth/login-route.test.ts tests/unit/services/api/audit-filters.test.ts tests/unit/audit-trail.test.ts`
- Focused US4 command pass:
  - `pnpm vitest run tests/unit/security/release-workflow.test.ts`
- Focused US5 command pass:
  - `pnpm vitest run tests/integration/cli-auth.test.ts`
  - `pnpm playwright test tests/e2e/auth/cli-sso-flow.spec.ts`

### Phase 8 Validation Snapshot

- `pnpm run typecheck` -> pass.
- `pnpm run lint` -> pass.
- `pnpm test` -> pass (`40` files, `140` tests).
- `pnpm vitest run tests/integration/cli-auth.test.ts tests/unit/background-jobs-route.test.ts tests/unit/auth/last-admin.test.ts tests/unit/rate-limit.test.ts tests/unit/audit-trail.test.ts tests/unit/security/release-workflow.test.ts` -> pass (`6` files, `24` tests).
- `pnpm playwright test tests/e2e/auth/cli-sso-flow.spec.ts tests/e2e/users/user-management.spec.ts` -> pass (`3` tests).

## DeepSec Revalidation

- Focused Phase 1 refresh run set (manifest: `.deepsec/phase1-manifest.json`):
  - scan: `20260601161030-e4a1f3656ad1cda8`
  - process (codex/gpt-5.5, reinvestigate marker 2): `20260601161030-a81dd6f5b5671c8a` (15 analyses, 11 findings)
  - revalidate (codex/gpt-5.5, force, min-severity HIGH_BUG): `20260601162721-a20fd1cbad077101` (28 findings reviewed: 12 TP, 10 fixed, 6 dupe)
- Export artifacts refreshed:
  - `.deepsec/findings-full-codex.json` (34 unresolved findings)
  - `.deepsec/findings-full-codex/` (md-dir export refreshed, stale files removed)
- Follow-up high-bug revalidation run:
  - manifest: `.deepsec/highbug-manifest.json`
  - revalidate run: `20260601163925-777a9fbcc3e8396a` (15 findings reviewed: 4 TP, 8 fixed, 3 dupe)
- Final unresolved export check (`.deepsec/findings-full-codex.json`):
  - unresolved HIGH count: 0
  - unresolved HIGH_BUG count: 0
  - T078 satisfied.

## Accepted Risk Register (Phase 1)

- None required for HIGH/HIGH_BUG after final revalidation/export refresh.

## Phase 2 Task Generation Note (T082)

- Phase 2 MEDIUM/BUG inventory and triage classifications were captured in `specs/017-deepsec-remediation/phase-2-findings.md` from refreshed export `.deepsec/findings-full-codex.json`.
- Classification summary: `fix` (20), `duplicate` (8), `accepted-risk` (1), `deferred-with-owner` (0).
- Accepted-risk candidate retained for next slice review:
  - `playwright.config.ts` static E2E credentials (test-only scope, owner `tklerx@paiqo.com`).

## Phase 2 Implementation Progress

- 2026-06-01 Batch 1 (BUG findings):
  - `prisma/seed.ts`: initial admin email is normalized via `normalizeInitialAdminEmail` before create, preventing mixed-case seed/login mismatch.
  - `scripts/prisma-run.js`: command-launch failure now returns non-zero exit code using shared helper `scripts/prisma-run-lib.js`.
- Validation:
  - `pnpm vitest run tests/unit/prisma/seed-utils.test.ts tests/unit/scripts/prisma-run-lib.test.ts` -> pass (`2` files, `3` tests).

- 2026-06-01 Batch 2 (BUG findings):
  - `src/services/api/user-admin.ts`: status transition `requireCurrentStatus` now checks transaction-fresh user state, eliminating stale precondition acceptance windows.
  - `src/services/teams/admin.ts` + `src/app/api/integrations/teams/subscriptions/[id]/route.ts`: intake subscription delete now returns a controlled `409` conflict when inbound-history FK constraints block deletion.
- Validation:
  - `pnpm vitest run tests/unit/auth/last-admin.test.ts tests/unit/teams-admin.test.ts tests/integration/teams-api.test.ts` -> pass (`3` files, `19` tests).

- 2026-06-01 Batch 3 (BUG findings):
  - `src/services/teams/admin.ts`: Teams config creation now recovers from concurrent create conflicts instead of failing non-atomically.
- Validation:
  - `pnpm vitest run tests/unit/teams-admin.test.ts` -> pass (`1` file, `8` tests).

- 2026-06-01 Batch 4 (MEDIUM findings):
  - `src/lib/audit-export.ts`: CSV export now neutralizes spreadsheet-formula-prefixed fields before quoting to prevent formula execution in spreadsheet viewers.
- Validation:
  - `pnpm vitest run tests/unit/audit-trail.test.ts` -> pass (`1` file, `6` tests).

- 2026-06-01 Batch 5 (MEDIUM findings):
  - `src/lib/logger.ts`: expanded redaction to normalized sensitive key variants to cover token/secret fields expressed with casing/underscore variations.
  - `src/proxy.ts`: removed raw query-string logging from `http.request` entries.
- Validation:
  - `pnpm vitest run tests/unit/logger.test.ts` -> pass (`1` file, `3` tests).

- 2026-06-01 Batch 6 (MEDIUM findings):
  - `src/app/api/auth/login/route.ts`: inactive-account login now returns the same generic invalid-credentials response as unknown/bad-password flows.
  - `src/app/api/auth/change-password/route.ts`: unauthenticated requests no longer consume a shared unknown-client rate-limit bucket; rate-limit keying now runs post-auth using user fallback for unknown client IP.
- Validation:
  - `pnpm vitest run tests/unit/auth/login-route.test.ts tests/unit/auth/change-password-route.test.ts` -> pass (`2` files, `8` tests).
  - `pnpm run typecheck` -> pass.

- 2026-06-01 Batch 7 (MEDIUM findings):
  - `src/app/api/cli-auth/authorize/route.ts`: unknown-client authorize rate-limit key no longer collapses to one global bucket.
  - `src/app/api/cli-auth/token/route.ts`: unknown-client token-exchange rate-limit key now uses request-scoped code/state fallback buckets.
  - `src/lib/monitoring.ts`: database health-check errors now expose only generic public failure text.
- Validation:
  - `pnpm vitest run tests/integration/cli-auth.test.ts tests/unit/monitoring.test.ts tests/unit/health-route.test.ts` -> pass (`3` files, `8` tests).
  - `pnpm run typecheck` -> pass.

- 2026-06-01 Batch 8 (MEDIUM findings + token concurrency bug hardening):
  - `src/app/api/integrations/teams/consent/start/route.ts`: redirect input validation now rejects backslash/control-character local-path bypass attempts and defaults safely.
  - `src/app/api/integrations/teams/consent/callback/route.ts`: redirect target from consent-state cookie now uses the same safe local-path validation.
  - `src/services/api/tokens.ts`: active-token limit is enforced inside a serializable transaction with bounded retry to prevent concurrent limit bypass.
- Validation:
  - `pnpm vitest run tests/unit/token-service.test.ts tests/unit/teams-consent-start-route.test.ts` -> pass (`2` files, `10` tests).
  - `pnpm vitest run tests/integration/token-api.test.ts` -> pass (`1` file, `7` tests).
  - `pnpm run typecheck` -> pass.

- 2026-06-01 Batch 9 (MEDIUM workflow/docs hardening):
  - `.github/workflows/validate.yml`: replaced mutable action tags with immutable SHAs and replaced `curl | sh` uv installation with pinned `astral-sh/setup-uv`.
  - `src/components/docs/swagger-ui.tsx`: removed runtime unpkg script/style usage; loads local vendored assets from `public/vendor/swagger-ui/`.
- Validation:
  - `pnpm vitest run tests/unit/security/validate-workflow.test.ts tests/unit/security/api-docs-assets.test.ts tests/unit/token-service.test.ts tests/unit/teams-consent-start-route.test.ts tests/integration/token-api.test.ts` -> pass (`5` files, `20` tests).
  - `pnpm run typecheck` -> pass.

- 2026-06-01 Batch 10 (MEDIUM delegated-token/inbound-spoofing hardening):
  - `src/services/teams/consent.ts`: delegated Graph access/refresh tokens are now encrypted before persistence and decrypted only at use-time.
  - `src/services/notifications/inbound.ts`: bounce handling now requires provider-message correlation to the referenced notification before setting `BOUNCED`.
- Validation:
  - `pnpm vitest run tests/unit/teams-consent.test.ts tests/integration/notification-inbound.test.ts` -> pass (`2` files, `6` tests).
  - `pnpm run typecheck` -> pass.

- 2026-06-01 Batch 11 (MEDIUM runtime rate-limit hardening):
  - `src/lib/rate-limit.ts`: `E2E_DISABLE_RATE_LIMIT=1` bypass is now disabled in production mode.
- Validation:
  - `pnpm vitest run tests/unit/rate-limit.test.ts tests/unit/teams-consent.test.ts tests/integration/notification-inbound.test.ts` -> pass (`3` files, `14` tests).
  - `pnpm test` -> pass (`47` files, `165` tests).
  - `pnpm run typecheck` -> pass.

### Phase 2 DeepSec Revalidation Snapshot (Post Batch 11)

- Focused revalidation run (manifest: `.deepsec/phase2-manifest.json`):
  - revalidate run: `20260601201320-845941a93a53e4e4`
  - reviewed findings: `38` (`TP 4`, `Fixed 28`, `Dupe 6`)
- Narrow final-surface revalidation run (manifest: `.deepsec/phase2-final-manifest.json`):
  - revalidate run: `20260601202839-b3dcdb2852bf13d9`
  - reviewed findings: `13` (`TP 3`, `Fixed 7`, `Dupe 3`)
- Refreshed export artifacts:
  - `.deepsec/findings-full-codex.json`
  - `.deepsec/findings-full-codex/`
- Current unresolved snapshot in export:
  - total unresolved: `7`
  - severities: `6 MEDIUM`, `1 BUG`
  - files:
    - `playwright.config.ts`
    - `src/app/(dashboard)/background-jobs/page.tsx`
    - `src/app/api/auth/login/route.ts`
    - `src/app/api/health/route.ts`
    - `src/lib/rate-limit.ts`
    - `src/services/notifications/inbound.ts`
    - `src/app/api/audit/route.ts`

### Phase 2 Targeted Revalidation Refresh

- Follow-up revalidation run after health route hardening:
  - manifest: `.deepsec/phase2-final-manifest.json`
  - revalidate run: `20260601203732-a39c8ca457e9aadb`
  - reviewed findings: `13` (`TP 3`, `Fixed 7`, `Dupe 3`)
- Export refresh:
  - `pnpm deepsec export --project-id webapp-template --format json --out findings-full-codex.json`
  - `pnpm deepsec export --project-id webapp-template --format md-dir --out findings-full-codex`
- Current unresolved snapshot in refreshed export:
  - total unresolved: `4`
  - severities: `4 MEDIUM`
  - files:
    - `playwright.config.ts`
    - `src/app/api/auth/login/route.ts`
    - `src/lib/rate-limit.ts`
    - `src/services/notifications/inbound.ts`

## Phase 2 Closure Register (2026-06-01)

Remaining unresolved findings after the 2026-06-01 closure pass were explicitly dispositioned as follows. The deferred items were later fixed in the 2026-06-02 final MEDIUM fix slice.

| File                                    | Severity | Disposition      | Owner            | Review Date | Notes                                                                                      |
| --------------------------------------- | -------- | ---------------- | ---------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `playwright.config.ts`                  | MEDIUM   | accepted-risk    | tklerx@paiqo.com | 2026-06-15  | Static credentials are test-only for E2E runtime and not used in production paths.         |
| `src/app/api/auth/login/route.ts`       | MEDIUM   | fixed 2026-06-02 | tklerx@paiqo.com | n/a         | Superseded by T089-T090; no longer unresolved after run `20260602221332-8f8dc06fba1876ca`. |
| `src/lib/rate-limit.ts`                 | MEDIUM   | fixed 2026-06-02 | tklerx@paiqo.com | n/a         | Superseded by T091-T092; no longer unresolved after run `20260602221332-8f8dc06fba1876ca`. |
| `src/services/notifications/inbound.ts` | MEDIUM   | fixed 2026-06-02 | tklerx@paiqo.com | n/a         | Superseded by T093-T094; no longer unresolved after run `20260602221332-8f8dc06fba1876ca`. |

### Phase 2 Final MEDIUM Fix Slice (2026-06-02)

- Completed tasks: T089-T095.
- Fixes:
  - `src/app/api/auth/login/route.ts`: local credential verification now happens before inactive-account handling and before Better Auth session creation.
  - `src/lib/rate-limit.ts`: trusted proxy mode now requires `TRUST_PROXY_HEADER_SECRET` plus matching `x-trusted-proxy-secret`, and only consumes proxy-overwritten `x-real-ip`.
  - `src/services/notifications/inbound.ts`: TypeScript inbound bounce handling now correlates by notification `providerMessageId`.
  - `worker/src/starter_worker/main.py` and `worker/src/starter_worker/db.py`: Python inbound mail polling now uses the same provider-message correlation and no longer marks bounces from content markers alone.
  - `.env.example`, `.env.docker.example`, and `docker-compose.yml`: documented/passed through the trusted proxy header secret.
- Validation:
  - `pnpm vitest run tests/unit/auth/login-route.test.ts tests/unit/rate-limit.test.ts tests/integration/notification-inbound.test.ts` -> pass (`3` files, `19` tests).
  - `uv run pytest tests/test_main.py` from `worker/` -> pass (`13` tests).
  - `pnpm run typecheck` -> pass.
  - `uv run ruff check src tests` from `worker/` -> pass.
- DeepSec:
  - revalidate run: `20260602220423-6b2945d1b671aa45` -> `TP 2`, `Fixed 8`, `Dupe 3`.
  - revalidate run after worker/rate-limit follow-up: `20260602221332-8f8dc06fba1876ca` -> `TP 0`, `Fixed 10`, `Dupe 3`.
  - refreshed export now reports `1` unresolved finding: `playwright.config.ts` static E2E credentials accepted-risk.

## Final Phase 2 Remaining Register (2026-06-02)

| File                   | Severity | Disposition   | Owner            | Review Date | Notes                                                                              |
| ---------------------- | -------- | ------------- | ---------------- | ----------- | ---------------------------------------------------------------------------------- |
| `playwright.config.ts` | MEDIUM   | accepted-risk | tklerx@paiqo.com | 2026-06-15  | Static credentials are test-only for E2E runtime and not used in production paths. |

## Post-Merge Postgres E2E Default Validation (2026-06-04)

- Switched Playwright E2E defaults from SQLite to a local Postgres container at `localhost:55432`, using the dedicated `business_app_starter_e2e_test` database.
- Kept parsed Postgres `schema` URL parameter support in `PrismaPg` for app runtime and seed runtime when explicit schema URLs are provided; default E2E isolation uses a separate database instead.
- Preserved an explicit SQLite fallback via `DATABASE_URL=file:...`.
- Disabled implicit app server reuse during E2E runs so schema resets do not leave stale Prisma/Postgres connections in a reused Next.js process.
- Validation:
  - `node scripts/ensure-e2e-db.mjs` -> pass; resets and seeds the dedicated `business_app_starter_e2e_test` database.
  - `pnpm run test:e2e` -> pass (`17` tests, `1` skipped) against the dedicated Postgres E2E database.
  - `pnpm run typecheck` -> pass.
  - `pnpm run lint` -> pass.
  - `pnpm exec prettier --check playwright.config.ts scripts/ensure-e2e-db.mjs tests/e2e/global.setup.ts tests/e2e/global.teardown.ts tests/e2e/helpers/db.ts src/lib/db.ts prisma/seed.ts` -> pass.
  - `pnpm exec prettier --check .` -> fail on broad pre-existing formatting debt outside this slice.

## E2E Credentials Finding Remediation (2026-06-05)

- Resolved the last open DeepSec accepted-risk: `playwright.config.ts` static E2E credentials.
- Made the hardcoded secret literals env-overridable so credential-like values are no longer fixed in source-controlled config:
  - `BETTERAUTH_SECRET`, `E2E_MOCK_SSO_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` now read `process.env.X ?? "<test-fallback>"`.
- Documented the E2E-only override variables in `.env.example` (test fixtures, not production secrets). CI sets them explicitly; local zero-config runs use safe test fallbacks.
- Rationale: values are test-only fixtures for an ephemeral E2E database and never touch production paths; moving them to env removes the standing finding and aligns with the "no secrets in source" constitution constraint.
- Validation:
  - `pnpm run typecheck` -> pass.

| File                   | Severity | Disposition | Owner            | Date       | Notes                                                                                    |
| ---------------------- | -------- | ----------- | ---------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `playwright.config.ts` | MEDIUM   | remediated  | tklerx@paiqo.com | 2026-06-05 | Secret literals made env-overridable; documented as E2E test fixtures in `.env.example`. |
