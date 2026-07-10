# Research: Auth Security Hardening

**Feature**: 010-auth-security-hardening | **Date**: 2026-04-01

## R1: In-Memory Rate Limiting Approach

**Decision**: Use a plain `Map<string, { count: number; resetAt: number }>` keyed by IP address, with a periodic cleanup of expired entries.

**Rationale**: The project is single-instance (~10 users), so in-memory state is sufficient. No new dependencies needed. A Map with timestamp-based expiry is the simplest implementation that satisfies the 5-attempts-per-15-minute-window requirement.

**Alternatives considered**:

- `rate-limiter-flexible` npm package — adds a dependency for minimal gain at this scale.
- Database-backed rate limits — unnecessary complexity; resets on restart are acceptable per clarification.
- BetterAuth built-in rate limiting — BetterAuth does not expose per-route rate limit hooks suitable for custom thresholds.

**Implementation notes**:

- Export a `checkRateLimit(ip: string, endpoint: string)` function returning `{ allowed: boolean; retryAfterMs: number }`.
- Sliding window approximation: track the timestamp of the first attempt in the current window; if 5 attempts are reached, block until `resetAt`.
- Fixed window (not sliding) is simpler and sufficient: reset count after 15 minutes from the first attempt.
- Cleanup: run a sweep of expired entries every 5 minutes via `setInterval` to prevent unbounded growth. At ~10 users this is negligible, but good hygiene.
- Extract IP from `request.headers.get("x-forwarded-for")` first segment or fall back to `request.headers.get("x-real-ip")` or `"unknown"`.

## R2: Proxy/Origin Trust Hardening

**Decision**: When `AUTH_BASE_URL` is not set, fall back to `request.url` origin only (ignore forwarded headers). Log a warning on startup if `AUTH_BASE_URL` is unset in production.

**Rationale**: The current `getExternalOrigin` function in `azure-auth.ts` trusts `x-forwarded-host` and `x-forwarded-proto` headers when `AUTH_BASE_URL` is absent. This allows an attacker to manipulate callback URLs. The fix is to only trust forwarded headers when an explicit origin is configured (meaning the operator has intentionally set up a reverse proxy). Additionally, `better-auth.ts` sets `trustedProxyHeaders: true` unconditionally — this should be conditional on `AUTH_BASE_URL` being set.

**Alternatives considered**:

- Always require `AUTH_BASE_URL` (fail hard) — too disruptive for local development.
- Allow a separate `TRUST_PROXY` env var — overengineered for this use case.

**Implementation notes**:

- In `getExternalOrigin`: if `AUTH_BASE_URL` is set, return it. Otherwise, return `request.url` origin directly (no forwarded header inspection).
- In `better-auth.ts`: set `trustedProxyHeaders` to `!!process.env.AUTH_BASE_URL`.

## R3: SSO Identity Fallback Risk

**Decision**: Remove the unsigned `id_token` JWT decode fallback in `fetchAzureUserProfile`. If the Graph `/oidc/userinfo` call fails, throw an error instead of decoding the unverified `id_token`.

**Rationale**: The `id_token` from Azure AD is a signed JWT, but `decodeJwtPayload` only Base64-decodes the payload without verifying the signature. This means a tampered `id_token` could inject arbitrary identity claims. BetterAuth's own SSO flow handles token verification through the library; the custom `fetchAzureUserProfile` path should fail closed rather than accepting unverified data.

**Alternatives considered**:

- Verify the `id_token` signature using JWKS — adds significant complexity (key rotation, caching) for a fallback path that shouldn't be needed if Azure is healthy.
- Keep the fallback but log a warning — still accepts unverified identity, violating FR-005.

**Implementation notes**:

- In `fetchAzureUserProfile`: remove the `decodeJwtPayload` fallback branch. If `response.ok` is false, throw with the error details (existing behavior when both Graph and id_token fail).
- The `decodeJwtPayload` function can be removed entirely as it becomes unused.

## R4: E2E Mock SSO Production Gate

**Decision**: Gate the mock SSO path on `process.env.NODE_ENV !== "production"` in addition to the existing `E2E_MOCK_SSO === "1"` check.

**Rationale**: The `E2E_MOCK_SSO` env var could accidentally be set in production. Adding a `NODE_ENV` guard ensures the mock path is completely unreachable in production builds regardless of env var state.

**Alternatives considered**:

- Remove mock SSO entirely — breaks E2E test infrastructure.
- Check `process.env.NODE_ENV === "test"` only — too restrictive, blocks local dev testing.

**Implementation notes**:

- Change the condition in `src/app/api/auth/sso/azure/route.ts` from `process.env.E2E_MOCK_SSO === "1"` to `process.env.E2E_MOCK_SSO === "1" && process.env.NODE_ENV !== "production"`.

## R5: User Status Filter Validation

**Decision**: Validate the `status` query parameter against `Object.values(UserStatus)` before passing it to Prisma.

**Rationale**: The current code casts `url.searchParams.get("status") as UserStatus | null` without validation. An invalid value would be passed to Prisma, which may return empty results silently or throw an internal error depending on the database adapter. Explicit validation returns a clear 400 error.

**Alternatives considered**:

- Use Zod schema — adds a dependency for a single enum check; not justified by Simplicity First.
- Ignore invalid values (treat as no filter) — masks caller mistakes.

**Implementation notes**:

- In `src/app/api/users/route.ts` GET handler: if `status` is provided but not in `Object.values(UserStatus)`, return `jsonError("Invalid status filter. Supported values: ...", 400)`.

## R6: Audit Integration Strategy

**Decision**: Call the existing `logAudit` function from each route, wrapped in try/catch with `console.error` on failure (log-and-continue per clarification).

**Rationale**: The `logAudit` function and `AuditAction` enum already exist with the needed action types (AUTH_LOGIN_SUCCEEDED, AUTH_LOGIN_REJECTED, etc.). The function just isn't called from the routes yet. No new infrastructure needed — just integration.

**Alternatives considered**:

- Middleware-based audit logging — harder to capture action-specific context (target user, outcome).
- BetterAuth hooks for login events — BetterAuth's hook API doesn't expose enough context for our audit schema.

**Implementation notes**:

- Create a helper `safeLogAudit(input)` that wraps `logAudit` in try/catch and logs errors to `console.error`. Use this in all routes.
- Routes to instrument: login (success + failure), logout, change-password, user creation, approve, deactivate, reactivate, role change.
- For login failures, the actor may not be authenticated — use the target email as the entity identifier and "anonymous" or the IP as actor context. Since `actorId` is a FK to User, for unauthenticated failures we can use the target user's ID (the account being attacked) or skip the audit entry if no user is found (no account = nothing to audit).

## R7: Seed Password Validation

**Decision**: Import and call `validatePasswordComplexity` in `prisma/seed.ts` before hashing the initial admin password.

**Rationale**: The seed currently accepts any password from `INITIAL_ADMIN_PASSWORD`. This violates FR-012 which requires the same password policy everywhere. The `validatePasswordComplexity` function already exists in `src/lib/auth.ts`.

**Alternatives considered**:

- Duplicate the validation inline in seed.ts — violates Duplication Control.
- Skip validation for seed (operator responsibility) — violates the spec requirement.

**Implementation notes**:

- Import `validatePasswordComplexity` from `@/lib/auth` (or use a relative import since seed.ts runs outside Next.js).
- Throw a descriptive error if the password doesn't meet requirements, before creating the user.
- Note: seed.ts uses direct bcrypt import, not the `hashPassword` wrapper. The validation function is pure (no framework deps) so it can be imported directly with a relative path.
