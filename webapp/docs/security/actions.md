# Security Actions

Updated: 2026-04-21

This document turns the broader review in [followups.md](/c:/dev/webapp-template/docs/security/followups.md) into a maintained action tracker. Completed items stay here as an audit trail; remaining items are the next concrete implementation targets.

## Completed

### Action 13: Pin Release Workflow Actions And Scope Write Permission

Status: Completed

Changes landed:

- Split CLI release workflow into `validate` (read-only) and `publish` (write) jobs.
- Pinned `actions/checkout`, `actions/setup-go`, and `goreleaser/goreleaser-action` to immutable commit SHAs.
- Replaced GoReleaser `latest` with explicit `v2.16.0`.

Files:

- [.github/workflows/cli-release.yml](/c:/dev/webapp-template/.github/workflows/cli-release.yml)
- [tests/unit/security/release-workflow.test.ts](/c:/dev/webapp-template/tests/unit/security/release-workflow.test.ts)

Maintenance procedure:

1. Choose target action tag/version and GoReleaser release version.
2. Resolve immutable action commit SHA via GitHub API:
   - `https://api.github.com/repos/actions/checkout/git/ref/tags/<tag>`
   - `https://api.github.com/repos/actions/setup-go/git/ref/tags/<tag>`
   - `https://api.github.com/repos/goreleaser/goreleaser-action/git/ref/tags/<tag>`
3. Update `.github/workflows/cli-release.yml` with new SHAs and explicit GoReleaser version.
4. Run `pnpm vitest run tests/unit/security/release-workflow.test.ts`.
5. Record update in `specs/017-deepsec-remediation/remediation-evidence.md`.

Latest verification:

- Revalidated during Phase 1 closure on 2026-06-01 with `pnpm vitest run tests/unit/security/release-workflow.test.ts` (pass).

### Action 1: Restrict Background Jobs Endpoint

Status: Completed

Changes landed:

- `POST /api/background-jobs` now requires `PLATFORM_ADMIN`.
- Job types are allowlisted in `src/services/api/background-jobs.ts`.
- Payloads larger than 10KB are rejected.
- Unit coverage was added for allowed requests, unsupported job types, and oversized payloads.

Files:

- [src/app/api/background-jobs/route.ts](/c:/dev/webapp-template/src/app/api/background-jobs/route.ts)
- [src/services/api/background-jobs.ts](/c:/dev/webapp-template/src/services/api/background-jobs.ts)
- [tests/unit/background-jobs-route.test.ts](/c:/dev/webapp-template/tests/unit/background-jobs-route.test.ts)

Follow-up:

- Optional rate limiting is still open if this endpoint grows beyond current admin/internal usage.

### Action 2: Add Production Placeholder Guards

Status: Partially completed

Changes landed:

- `INITIAL_ADMIN_PASSWORD` now fails fast in production when still set to the default `ChangeMe123!`.
- Docker Compose now rejects blank/default `POSTGRES_PASSWORD` values in the production-style `app`, `migrate`, and `worker` flows.

Files:

- [prisma/seed.ts](/c:/dev/webapp-template/prisma/seed.ts)
- [docker-compose.yml](/c:/dev/webapp-template/docker-compose.yml)

Remaining:

- A shared app startup guard for additional placeholder or unsafe production values is still open.

### Action 3: Run App Container As Non-Root

Status: Completed

Changes landed:

- The runtime `runner` stage in `Dockerfile.app` now creates and uses a dedicated non-root user.
- Writable paths are created and assigned before switching users.
- The Compose `migrate` service keeps `user: "0:0"` with an inline note that this is intentional.

Files:

- [Dockerfile.app](/c:/dev/webapp-template/Dockerfile.app)
- [docker-compose.yml](/c:/dev/webapp-template/docker-compose.yml)

### Action 4: Add Network Isolation In Docker Compose

Status: Completed

Changes landed:

- Compose services now join an explicit `internal` network instead of relying only on the default bridge layout.

Files:

- [docker-compose.yml](/c:/dev/webapp-template/docker-compose.yml)

### Action 8: Harden Mock SSO Production Guard

Status: Completed

Changes landed:

- Added a hard crash guard if `E2E_MOCK_SSO=1` in `NODE_ENV=production`, regardless of any override flag.
- Removed `E2E_ALLOW_PROD_MOCK_SSO` bypass — mock SSO now only works in non-production.

Files:

- [src/app/api/auth/sso/azure/route.ts](/c:/dev/webapp-template/src/app/api/auth/sso/azure/route.ts)

### Action 9: Add Account-Level Login Rate Limiting

Status: Completed

Changes landed:

- Login route now rate-limits by email (10 attempts / 15 min) in addition to IP-based limiting.
- Prevents brute-force against a specific account even when attacker spoofs `X-Forwarded-For`.
- `checkRateLimit` now accepts optional `windowMs` and `maxAttempts` overrides.

Files:

- [src/lib/rate-limit.ts](/c:/dev/webapp-template/src/lib/rate-limit.ts)
- [src/app/api/auth/login/route.ts](/c:/dev/webapp-template/src/app/api/auth/login/route.ts)

### Action 10: Add Rate Limiting To CLI Auth Token Exchange

Status: Completed

Changes landed:

- `POST /api/cli-auth/token` now checks IP-based rate limit before processing.

Files:

- [src/app/api/cli-auth/token/route.ts](/c:/dev/webapp-template/src/app/api/cli-auth/token/route.ts)

## Remaining

### Action 12: Complete Runtime Credential Separation

Priority: Medium

Problem:

- Production-style Compose previously used one broad environment block for the app, worker, and migration services.
- That made it easy for the public app runtime to receive worker-only or migration-only credentials.

What to do:

- Complete spec `016-runtime-credential-separation`.
- Keep app, worker, and migration database URLs separate through `APP_DATABASE_URL`, `WORKER_DATABASE_URL`, and `MIGRATION_DATABASE_URL`.
- Keep worker-owned Graph mail credentials out of the app runtime unless a documented exception exists.
- Run `pnpm run validate:runtime-credentials` with the normal validation flow.

Suggested files:

- [docs/runtime-credentials.md](/c:/dev/webapp-template/docs/runtime-credentials.md)
- [docker-compose.yml](/c:/dev/webapp-template/docker-compose.yml)
- [scripts/validate-runtime-credentials.ps1](/c:/dev/webapp-template/scripts/validate-runtime-credentials.ps1)

### Action 0: Upgrade `next` And `next-intl` After Cooldown Window

Priority: High

Target date: 2026-04-17

Problem:

- `pnpm audit --prod --no-optional` currently reports production vulnerabilities in `next` and `next-intl`.
- The repo enforces `min-release-age=7` in `.npmrc`, so the fixed versions should not be installed immediately after release.

What to do on 2026-04-17:

- Upgrade `next` to `16.2.3` or newer.
- Upgrade `next-intl` to `4.9.1` or newer.
- Run `.\validate.ps1 all`.
- Re-run `pnpm audit --prod --no-optional` and confirm the production audit is clean.

Why 2026-04-17:

- `next@16.2.3` was published on 2026-04-08 and clears the 7-day cooldown earlier.
- `next-intl@4.9.1` was published on 2026-04-10, so 2026-04-17 is the first date when both fixes are outside the cooldown window.

Suggested command:

- `pnpm install next@16.2.3 next-intl@4.9.1`

### Action 11: Move Rate Limiting To Shared Store For Multi-Instance Deployments

Priority: Medium (when scaling beyond single instance)

Problem:

- Rate limit state lives in process memory (`Map`). Server restart resets counters; multiple replicas maintain independent state, giving attackers N× the allowed attempts across N instances.

What to do:

- Replace the in-memory `Map` with Redis or a database-backed counter.
- Alternatively, use a reverse proxy rate limiter (nginx, Cloudflare, API gateway) as the primary defense and keep the in-memory store as a fallback.

Known limitation:

- Acceptable for single-instance deployments. Document the constraint for operators scaling the app.

Suggested files:

- [src/lib/rate-limit.ts](/c:/dev/webapp-template/src/lib/rate-limit.ts)

### Action 5: Add Rate Limiting To Background Job Creation

Priority: Low to Medium

Problem:

- Role restriction and validation are now in place, but an admin could still create excessive jobs quickly.

What to do:

- Count recent jobs by `createdByUserId` over a short window.
- Reject job creation when the threshold is exceeded.
- Return a clear 429-style error payload.

Suggested files:

- [src/services/api/background-jobs.ts](/c:/dev/webapp-template/src/services/api/background-jobs.ts)

### Action 6: Centralize Production Startup Guards

Priority: Medium

Problem:

- Production placeholder checks now exist in a few targeted places, but they are not centralized.

What to do:

- Add a shared startup validation module for production-only checks.
- Use it to validate high-risk placeholders and dangerous defaults consistently.

Suggested files:

- `src/lib/startup-guards.ts`
- runtime startup entry points that should fail fast in production

### Action 7: Review Security-Relevant Audit Coverage

Priority: Medium

Problem:

- The app already audits useful events, but there is still room to tighten visibility around security-relevant behavior.

What to do:

- Review failed auth, role changes, approvals, audit exports, and queue creation for operational visibility.
- Decide which events should stay UI-only and which should be promoted to external alerting or incident review.

## Not Actionable / Already Handled

- Auth/authorization route enforcement for existing admin mutations is already in place.
- Better Auth production secret guard is already implemented.
- Azure AD placeholder detection already disables SSO when credentials are obviously fake.
- The approve route does not need a last-admin guard because it cannot remove admin capability.
