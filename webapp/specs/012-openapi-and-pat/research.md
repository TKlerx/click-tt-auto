# Research: OpenAPI Specification & Personal Access Tokens

**Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)

## Token Generation & Hashing

**Decision**: Use Node.js `crypto.randomBytes(32)` for token generation, prefixed with a configurable prefix from `.env` (`PAT_TOKEN_PREFIX`, default `starter_pat`). Hash with `crypto.createHash('sha256')` for storage.

**Rationale**: SHA-256 is appropriate for token hashing (unlike passwords, tokens have high entropy so brute-forcing is infeasible). bcrypt is unnecessarily slow for this use case. The project already uses `crypto` (Node.js built-in), so no new dependency.

**Alternatives considered**:

- bcrypt: Too slow for per-request token lookup (each validation would require bcrypt.compare). Designed for passwords, not high-entropy tokens.
- HMAC-SHA256: Adds key management complexity without benefit for this use case.
- UUID v4: Only 122 bits of entropy vs 256 bits from randomBytes(32). No prefix support.

## Token Authentication Middleware

**Decision**: Create a `resolveTokenUser()` function in `src/lib/token-auth.ts` that checks `Authorization: Bearer` and `X-API-Key` headers. Integrate into the existing `requireRouteUser()` in `src/services/api/route-context.ts` as a fallback when no session exists.

**Rationale**: The existing `requireRouteUser()` calls `getSessionUser()`. By adding a token fallback path, all existing routes automatically support PAT auth without modification. This avoids duplicating RBAC logic.

**Alternatives considered**:

- Separate middleware wrapper: Would require modifying every route handler. More invasive.
- BetterAuth plugin: BetterAuth doesn't have a first-party PAT plugin. Writing a custom plugin adds coupling to BetterAuth internals.
- Next.js middleware (middleware.ts): Runs on the edge, can't access Prisma directly. Would require a separate token validation API call.

## CLI Browser Login Flow

**Decision**: Implement a lightweight OAuth2-like authorization code flow with three components:

1. `GET /api/cli-auth/authorize?callback_url=http://localhost:PORT&state=RANDOM` â€” stores a `CliAuthCode` record, redirects to login page with return URL
2. Login page (existing) â€” after successful login, redirects to a `/cli-login` page that generates the auth code and redirects to the CLI's callback
3. `POST /api/cli-auth/token` â€” exchanges auth code for a PAT-like token

**Rationale**: Reuses the existing login page and session infrastructure. The `/cli-login` page acts as the intermediary that has access to the authenticated session and can generate the authorization code. This avoids modifying the existing login flow.

**Alternatives considered**:

- Modify existing login route to support redirect: Would add complexity to a security-critical path.
- WebSocket-based flow: Unnecessarily complex for a simple code exchange.
- Long-polling: Works but less reliable than the redirect approach.

## OpenAPI Specification Approach

**Decision**: Maintain a hand-written `openapi.yaml` file, served at `GET /api/openapi`. Use Swagger UI (via CDN or bundled) for the browsable docs page at `/docs/api`. The base path is injected at serve time from the configured base path.

**Rationale**: The API surface is small (~18 endpoints) and changes infrequently. Hand-written YAML gives full control over documentation quality. Auto-generation from route handlers would require decorators/annotations that Next.js App Router doesn't natively support, adding complexity for minimal benefit at this scale.

**Alternatives considered**:

- Auto-generation from TypeScript types (e.g., ts-rest, trpc-openapi): Requires significant refactoring of all route handlers. Overkill for ~18 endpoints.
- Zod-to-OpenAPI: Would require wrapping all request/response schemas in zod (partial coverage exists). Still requires manual endpoint registration.
- Redoc instead of Swagger UI: Redoc has better docs layout but is heavier. Swagger UI is more widely recognized and supports "Try it out" for authenticated users.

## Token Format & Display

**Decision**: Token format is `{prefix}_{base64url(randomBytes(32))}` where prefix comes from `PAT_TOKEN_PREFIX` env var (default: `starter_pat`). Display prefix in the UI is the first 8 characters after the prefix separator (e.g., `starter_pat_a1b2c3d4...`).

**Rationale**: Base64url encoding is URL-safe and compact. 32 random bytes = 256 bits of entropy. The configurable prefix enables different instances to use different prefixes (e.g., `myapp_pat_`). 8-character display suffix is enough to distinguish tokens visually.

**Alternatives considered**:

- Hex encoding: 64 characters vs 43 for base64url. Unnecessarily long.
- No prefix: Harder to identify tokens in logs, configs, and leaked credential scans.

## Last-Used Timestamp Updates

**Decision**: Update `lastUsedAt` asynchronously (fire-and-forget) after the request is authenticated. Use a simple `prisma.personalAccessToken.update()` call without awaiting it in the request path.

**Rationale**: The last-used timestamp is informational, not critical. Blocking the request to update it would add latency to every PAT-authenticated request. A fire-and-forget update is eventual but sufficient for audit purposes.

**Alternatives considered**:

- Synchronous update: Adds ~5-10ms to every PAT-authenticated request.
- Batch updates with buffer: Over-engineered for ~10 users.
- Skip tracking: Loses useful audit information.

## Audit Trail Integration

**Decision**: Add new `AuditAction` enum values: `PAT_CREATED`, `PAT_REVOKED`, `PAT_RENEWED`, `PAT_DELETED`, `CLI_LOGIN_COMPLETED`. Use the existing `AuditEntry` model and `createAuditEntry()` service function.

**Rationale**: Follows the existing audit pattern. No structural changes needed â€” just new enum values and audit calls in the token service.
