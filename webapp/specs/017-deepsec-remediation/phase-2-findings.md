# Phase 2 Findings (MEDIUM + BUG)

Source: `.deepsec/findings-full-codex.json` (refreshed 2026-06-01 after Phase 1 closure)

## Batch Progress

- 2026-06-01 Batch 1 implemented:
  - `prisma/seed.ts` mixed-case initial admin email issue (normalized email before persistence).
  - `scripts/prisma-run.js` launch-failure exit-code issue (non-zero on spawn error).
  - Added unit coverage:
    - `tests/unit/prisma/seed-utils.test.ts`
    - `tests/unit/scripts/prisma-run-lib.test.ts`
- 2026-06-01 Batch 2 implemented:
  - `src/services/api/user-admin.ts` stale status precondition fix (transaction-fresh status checks for managed status transitions).
  - `src/app/api/integrations/teams/subscriptions/[id]/route.ts` + `src/services/teams/admin.ts` conflict handling for delete when inbound history exists.
  - Added coverage:
    - `tests/unit/auth/last-admin.test.ts` (fresh status precondition assertion)
    - `tests/unit/teams-admin.test.ts` (subscription delete FK conflict)
    - `tests/integration/teams-api.test.ts` (subscription delete route conflict response)
- 2026-06-01 Batch 3 implemented:
  - `src/services/teams/admin.ts` race-safe Teams config creation (recover on unique-constraint conflict after concurrent create).
  - Added coverage:
    - `tests/unit/teams-admin.test.ts` (concurrent create recovery path)
- 2026-06-01 Batch 4 implemented:
  - `src/lib/audit-export.ts` CSV spreadsheet-formula neutralization for cell values beginning with `=`, `+`, `-`, or `@`.
  - Added coverage:
    - `tests/unit/audit-trail.test.ts` (formula-cell neutralization assertions)
- 2026-06-01 Batch 5 implemented:
  - `src/lib/logger.ts` expanded sensitive-key redaction to normalized variants (e.g. `access_token`, `session_token`, `tokenValue`).
  - `src/proxy.ts` stopped logging raw query strings on request logs to avoid leaking OAuth/callback secrets.
  - Added coverage:
    - `tests/unit/logger.test.ts` (normalized token-key redaction assertions)
- 2026-06-01 Batch 6 implemented:
  - `src/app/api/auth/login/route.ts` normalized inactive-account login response to the same generic invalid-credentials response shape.
  - `src/app/api/auth/change-password/route.ts` moved rate limiting behind authenticated context and keyed unknown-client traffic to user-scoped buckets.
  - Added coverage:
    - `tests/unit/auth/login-route.test.ts` (inactive account generic failure response)
    - `tests/unit/auth/change-password-route.test.ts` (no shared unauthenticated rate-limit exhaustion)
- 2026-06-01 Batch 7 implemented:
  - `src/app/api/cli-auth/authorize/route.ts` unknown-client rate-limit keying no longer relies on a single shared bucket.
  - `src/app/api/cli-auth/token/route.ts` unknown-client token-exchange keying now scopes by code/state fallback, preventing global bucket exhaustion.
  - `src/lib/monitoring.ts` database health failures now return a generic public message instead of raw internal error details.
  - Added coverage:
    - `tests/integration/cli-auth.test.ts` (unknown-client bucket isolation for authorize/token routes)
    - `tests/unit/monitoring.test.ts` (generic DB failure message assertion)
- 2026-06-01 Batch 8 implemented:
  - `src/app/api/integrations/teams/consent/start/route.ts` rejects backslash/control-character redirect inputs and falls back to the default internal route.
  - `src/app/api/integrations/teams/consent/callback/route.ts` mirrors the same redirect-path hardening for state-derived redirect targets.
  - `src/services/api/tokens.ts` token creation now enforces active-token ceilings inside a serializable transaction with retry on serialization conflicts.
  - Added coverage:
    - `tests/unit/teams-consent-start-route.test.ts` (backslash redirect fallback)
    - `tests/unit/token-service.test.ts` (transactional token create path preserved)
    - `tests/integration/token-api.test.ts` (transaction-aware token route integration behavior)
- 2026-06-01 Batch 9 implemented:
  - `.github/workflows/validate.yml` now pins `actions/checkout`, `actions/setup-node`, `actions/setup-python`, and `astral-sh/setup-uv` to immutable SHAs.
  - `.github/workflows/validate.yml` no longer installs `uv` via remote `curl | sh`.
  - `src/components/docs/swagger-ui.tsx` now loads Swagger UI bundle/CSS from local vendored assets under `public/vendor/swagger-ui/` (no runtime CDN fetch).
  - Added coverage:
    - `tests/unit/security/validate-workflow.test.ts` (workflow pinning + no remote installer script)
    - `tests/unit/security/api-docs-assets.test.ts` (local Swagger asset usage, no unpkg URL)
- 2026-06-01 Batch 10 implemented:
  - `src/services/teams/consent.ts` now encrypts delegated access/refresh tokens at rest and decrypts only when needed for live Graph calls.
  - `src/services/notifications/inbound.ts` now requires verified provider-message correlation before marking a notification as bounced.
  - Added coverage:
    - `tests/unit/teams-consent.test.ts` (encryption/decryption + encrypted persistence assertions)
    - `tests/integration/notification-inbound.test.ts` (bounce correlation required; spoof-like messages ignored)
- 2026-06-01 Batch 11 implemented:
  - `src/lib/rate-limit.ts` now ignores `E2E_DISABLE_RATE_LIMIT=1` when `NODE_ENV=production`, preventing production-wide rate-limit bypass.
  - Added coverage:
    - `tests/unit/rate-limit.test.ts` (production bypass guard assertion)
- 2026-06-01 targeted hardening + revalidation refresh:
  - `src/app/api/health/route.ts` now returns status-only checks for both database and process on the public endpoint.
  - Revalidation run `20260601203732-a39c8ca457e9aadb` (manifest `.deepsec/phase2-final-manifest.json`) reduced unresolved findings from 7 to 4.
- 2026-06-02 Batch 12 planned:
  - Fix remaining actionable MEDIUM findings directly under tasks T089-T095.
  - Targets: login password/status ordering, trusted-proxy header trust boundary, and inbound bounce provider-message correlation.
- 2026-06-02 Batch 12 implemented:
  - `src/app/api/auth/login/route.ts` verifies local credentials before inactive-account handling and before Better Auth session creation.
  - `src/lib/rate-limit.ts` accepts trusted proxy IP identity only from `x-real-ip` with matching `x-trusted-proxy-secret`; `x-forwarded-for` is no longer consumed.
  - `src/services/notifications/inbound.ts` and `worker/src/starter_worker/main.py` correlate bounces by provider message id instead of user-controlled notification markers.
  - DeepSec revalidation run `20260602221332-8f8dc06fba1876ca` returned `TP 0`, `Fixed 10`, `Dupe 3`; refreshed export now has only the accepted-risk Playwright finding unresolved.

## Classification Legend

- `fix`: schedule remediation in Phase 2 implementation run.
- `duplicate`: overlaps another finding/remediation surface; track under primary finding.
- `accepted-risk`: intentionally accepted with explicit owner/review.
- `deferred-with-owner`: not in immediate Phase 2 execution slice; owner retained.

## Inventory And Classification

| Severity | File                                                         | Finding                                                                                 | Classification | Owner            | Notes                                                                                                                                                                |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| BUG      | `prisma/seed.ts`                                             | Mixed-case initial admin email can create an admin who cannot log in                    | fix            | tklerx@paiqo.com | Normalize seeded admin email casing and lookup behavior.                                                                                                             |
| BUG      | `scripts/prisma-run.js`                                      | Prisma wrapper exits successfully when command launch fails                             | fix            | tklerx@paiqo.com | Return non-zero exit on child-process startup failure.                                                                                                               |
| BUG      | `src/app/api/audit/route.ts`                                 | Invalid audit pagination can return the entire audit table                              | duplicate      | tklerx@paiqo.com | Covered by Phase 1 pagination validation work; verify on next revalidation wave.                                                                                     |
| BUG      | `src/app/api/integrations/teams/subscriptions/[id]/route.ts` | Deleting subscriptions with inbound history returns an unhandled server error           | fix            | tklerx@paiqo.com | Add conflict handling like delivery-target delete flow.                                                                                                              |
| BUG      | `src/services/api/user-admin.ts`                             | Status transition precondition is checked on stale user state                           | fix            | tklerx@paiqo.com | Extend transactional freshness checks for all status transitions.                                                                                                    |
| BUG      | `src/services/api/user-admin.ts`                             | Managed user mutations ignore PAT/CLI token auth                                        | fix            | tklerx@paiqo.com | Pass `Request` through managed mutation context auth path.                                                                                                           |
| BUG      | `src/services/teams/admin.ts`                                | Deleting intake subscriptions with history returns an unhandled database error          | duplicate      | tklerx@paiqo.com | Same root behavior as route-level subscription delete bug.                                                                                                           |
| BUG      | `src/services/teams/admin.ts`                                | Teams config creation is non-atomic                                                     | fix            | tklerx@paiqo.com | Replace read-then-create with `upsert`.                                                                                                                              |
| MEDIUM   | `.github/workflows/validate.yml`                             | Validation workflow executes unpinned remote installer script                           | fix            | tklerx@paiqo.com | Pin actions and replace `curl                                                                                                                                        | sh` install with pinned setup path. |
| MEDIUM   | `playwright.config.ts`                                       | E2E server uses static admin and mock SSO credentials                                   | accepted-risk  | tklerx@paiqo.com | Test-only runtime scope retained. Accepted risk with review date 2026-06-15.                                                                                         |
| MEDIUM   | `src/app/(dashboard)/background-jobs/page.tsx`               | Background jobs page exposes delegated Graph access tokens stored in job payloads       | duplicate      | tklerx@paiqo.com | Phase 1 redaction + storage change already landed; await scanner refresh convergence.                                                                                |
| MEDIUM   | `src/app/(dashboard)/docs/api/page.tsx`                      | Authenticated API docs execute an unpinned CDN script                                   | fix            | tklerx@paiqo.com | Self-host/pin Swagger UI assets.                                                                                                                                     |
| MEDIUM   | `src/app/api/audit/export/route.ts`                          | CSV audit export does not neutralize spreadsheet formulas                               | fix            | tklerx@paiqo.com | Add formula neutralization before CSV output.                                                                                                                        |
| MEDIUM   | `src/app/api/auth/change-password/route.ts`                  | Unauthenticated requests can exhaust the global password-change rate limit              | fix            | tklerx@paiqo.com | Use safer bucket key fallback (account/IP partition).                                                                                                                |
| MEDIUM   | `src/app/api/auth/login/route.ts`                            | Login flow discloses account existence and inactive status before password verification | fix            | tklerx@paiqo.com | Password verification now precedes inactive-account handling; no longer unresolved after run `20260602221332-8f8dc06fba1876ca`.                                      |
| MEDIUM   | `src/app/api/cli-auth/authorize/route.ts`                    | CLI authorization rate limit can be globally exhausted when client IP is unavailable    | fix            | tklerx@paiqo.com | Apply same account-scoped/nonce-safe bucket strategy.                                                                                                                |
| MEDIUM   | `src/app/api/cli-auth/token/route.ts`                        | Shared fallback rate-limit bucket lets unauthenticated clients block CLI token exchange | fix            | tklerx@paiqo.com | Remove shared unknown-client bucket behavior.                                                                                                                        |
| MEDIUM   | `src/app/api/health/route.ts`                                | Public health endpoint returns raw database failure details                             | fix            | tklerx@paiqo.com | Public health response now emits status-only checks; no longer unresolved after run `20260601203732-a39c8ca457e9aadb`.                                               |
| MEDIUM   | `src/app/api/integrations/teams/consent/callback/route.ts`   | Delegated Graph tokens are exposed through background job payloads                      | duplicate      | tklerx@paiqo.com | Same root issue as background-job token propagation; Phase 1 landed.                                                                                                 |
| MEDIUM   | `src/app/api/integrations/teams/consent/start/route.ts`      | Teams consent redirect accepts backslash-based external redirects                       | fix            | tklerx@paiqo.com | Harden redirect target normalization/validation.                                                                                                                     |
| MEDIUM   | `src/lib/audit-export.ts`                                    | Audit CSV export does not neutralize spreadsheet formulas                               | duplicate      | tklerx@paiqo.com | Primary fix tracked at route/export surface.                                                                                                                         |
| MEDIUM   | `src/lib/logger.ts`                                          | Logger can retain auth secrets in query strings and common token fields                 | fix            | tklerx@paiqo.com | Extend redaction sanitizer for query/key patterns.                                                                                                                   |
| MEDIUM   | `src/lib/monitoring.ts`                                      | Public health response exposes raw database error messages                              | fix            | tklerx@paiqo.com | Replace raw exception details with generic health failure message.                                                                                                   |
| MEDIUM   | `src/lib/rate-limit.ts`                                      | E2E flag can disable all runtime rate limits in production                              | fix            | tklerx@paiqo.com | Force-disable bypass flag in production mode.                                                                                                                        |
| MEDIUM   | `src/lib/rate-limit.ts`                                      | Trusted proxy mode accepts spoofable forwarded IP headers                               | fix            | tklerx@paiqo.com | Trusted proxy mode now requires a shared proxy secret and uses only proxy-overwritten `x-real-ip`; no longer unresolved after run `20260602221332-8f8dc06fba1876ca`. |
| MEDIUM   | `src/lib/rate-limit.ts`                                      | Default client IP fallback creates shared global rate-limit buckets                     | duplicate      | tklerx@paiqo.com | Phase 1 login/keying hardening already addresses primary auth path.                                                                                                  |
| MEDIUM   | `src/proxy.ts`                                               | OAuth and consent callback query secrets are logged verbatim                            | fix            | tklerx@paiqo.com | Redact query secrets before proxy logging.                                                                                                                           |
| MEDIUM   | `src/services/api/tokens.ts`                                 | Concurrent token creation can bypass the active-token limit                             | fix            | tklerx@paiqo.com | Add transactional/enforced active-token ceiling.                                                                                                                     |
| MEDIUM   | `src/services/notifications/inbound.ts`                      | Inbound email content can spoof notification bounce status                              | fix            | tklerx@paiqo.com | TypeScript and Python worker paths now require provider-message correlation; no longer unresolved after run `20260602221332-8f8dc06fba1876ca`.                       |
| MEDIUM   | `src/services/teams/consent.ts`                              | Delegated Microsoft Graph tokens are stored and propagated in plaintext                 | fix            | tklerx@paiqo.com | Encrypt at rest and avoid plaintext propagation.                                                                                                                     |
