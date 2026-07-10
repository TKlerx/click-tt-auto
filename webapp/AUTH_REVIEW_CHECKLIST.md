# Auth & Security Review Checklist

Use this file as the reusable baseline for future auth and security reviews.
When a review is completed for a specific feature, copy this checklist into
`specs/<feature>/reviews/` and add the dated findings there rather than
editing this reusable source directly.

Execute each item against the codebase. Mark pass/fail and note the file:line
where you verified it. Sections 1-10 focus on auth flow correctness.
Sections 11-24 cover broader application security.

## 1. Secret Management

- [ ] Production crashes or refuses to start if the auth secret is missing or is the development fallback
- [ ] Auth secret is never logged, serialized to JSON responses, or exposed in client bundles
- [ ] No secrets (API keys, client secrets, passwords) are hardcoded outside of `.env*` files or test fixtures
- [ ] `.env` files are listed in `.gitignore`

## 2. Password Hashing

- [ ] Passwords are hashed with bcrypt (or argon2/scrypt) with a cost factor >= 10
- [ ] Plain-text passwords are never stored in the database
- [ ] Plain-text passwords are never logged or included in API responses
- [ ] Password verification uses constant-time comparison (bcrypt.compare or equivalent)

## 3. Password Policy

- [ ] Minimum length >= 8 characters is enforced server-side
- [ ] Complexity rules (uppercase, lowercase, digit) are enforced server-side
- [ ] Password complexity is validated on all paths that set a password (user creation, password change, seed)
- [ ] New password !== current password is checked (optional but recommended)

## 4. Session Management

- [ ] Sessions are stored server-side (database), not solely in JWTs or client-side storage
- [ ] Session tokens are cryptographically random and sufficiently long
- [ ] Session cookies use `HttpOnly`, `Secure` (on HTTPS), and `SameSite` attributes
- [ ] Cookie path is scoped appropriately (not wider than necessary)
- [ ] Sessions have an expiration time
- [ ] Inactive/deactivated users are treated as unauthenticated even if they hold a valid session token
- [ ] Password change revokes all other active sessions for that user
- [ ] Logout destroys the session server-side (not just clearing the cookie)

## 5. Authentication Endpoints

- [ ] Login rejects missing or empty credentials with a 400
- [ ] Login returns a generic error for wrong email or wrong password (no user enumeration)
- [ ] Login rejects INACTIVE users with a clear message and does not create a session
- [ ] Login does not leak whether the email exists via timing or error message differences
- [ ] Self-service signup is disabled (if intended) - no public registration endpoint
- [ ] SSO initiation verifies that SSO is properly configured before redirecting
- [ ] SSO callback validates the OAuth state parameter to prevent CSRF (security)
- [ ] SSO callback handles token exchange errors gracefully without leaking internal details

## 6. Authorization / Route Protection

- [ ] All dashboard/protected pages enforce authentication server-side (not just client-side redirects)
- [ ] PENDING_APPROVAL users are redirected to a holding page, not the dashboard
- [ ] All admin API endpoints enforce role checks (PLATFORM_ADMIN or equivalent)
- [ ] Role checks use server-side enforcement, not just UI visibility
- [ ] Scope-restricted endpoints verify scope access for non-admin users
- [ ] API endpoints return 401 for unauthenticated requests
- [ ] API endpoints return 403 for authenticated but unauthorized requests
- [ ] Status codes are used consistently (401 = not authenticated, 403 = not authorized, 400 = bad input)
- [ ] Error messages across routes are consistent and do not leak internal details

## 7. Enum / Input Validation

- [ ] Role values are validated against the enum before being persisted (not just trusted from the request body)
- [ ] Status values are validated against the enum before being persisted
- [ ] Theme preference values are validated against the enum before being persisted
- [ ] Email addresses are lowercased consistently on all write paths (creation, login, SSO provisioning, credential lookup)
- [ ] Request bodies are typed and checked for required fields before use

## 8. User Lifecycle

- [ ] Admin-created users start with `mustChangePassword = true`
- [ ] SSO-provisioned users start with `status = PENDING_APPROVAL`
- [ ] The last PLATFORM_ADMIN cannot be deactivated
- [ ] The last PLATFORM_ADMIN cannot have their role downgraded
- [ ] Approve only works on PENDING_APPROVAL users
- [ ] Reactivate only works on INACTIVE users
- [ ] Deactivate revokes the user's active sessions (or the next session check treats them as unauthenticated)
- [ ] Auth method is updated to BOTH when a user authenticates via a second method

## 9. SSO / OAuth Specifics

- [ ] OAuth state parameter is generated with a CSPRNG
- [ ] OAuth state is validated on callback before exchanging the code
- [ ] Redirect URIs are constructed from server-side config, not from user input
- [ ] Token exchange uses `cache: "no-store"` or equivalent to prevent caching secrets
- [ ] The id_token fallback (when userinfo fails) does not trust the token without verifying the signature (security - note if this is a known gap)
- [ ] Mock/test SSO paths are gated behind an environment variable and cannot be triggered in production

## 10. Seed / Initial Setup

- [ ] Seed requires env vars for the initial admin credentials (not hardcoded)
- [ ] Seed is idempotent - does not create duplicates on re-run
- [ ] Seeded admin has `mustChangePassword = true`
- [ ] Seeded credential account uses the same hashing as the rest of the app

## 11. Cookie / Header Security

- [ ] Auth cookies use a `__Secure-` prefix when served over HTTPS
- [ ] `X-Forwarded-Host` / `X-Forwarded-Proto` are only trusted when explicitly configured (reverse proxy)
- [ ] CORS is not overly permissive on auth endpoints
- [ ] `Set-Cookie` headers from the auth library are forwarded correctly through custom response wrappers

## 12. Rate Limiting and Abuse Prevention

- [ ] Login endpoint has rate limiting or account lockout after repeated failures
- [ ] Password change endpoint has rate limiting
- [ ] SSO initiation cannot be used for open-redirect abuse (redirect targets are validated)

## 13. Logging and Audit

- [ ] Failed login attempts are logged or recorded in an audit trail
- [ ] Successful logins are logged or recorded
- [ ] Password changes are logged
- [ ] Role changes are logged
- [ ] User status changes (approve, deactivate, reactivate) are logged
- [ ] Logs do not contain passwords, tokens, or session secrets

## 14. Cross-Site Scripting (XSS)

- [ ] All user-supplied data rendered in HTML is escaped by the framework (React/JSX auto-escaping)
- [ ] No use of `dangerouslySetInnerHTML` without sanitization
- [ ] URL parameters displayed in the UI (e.g. `searchParams.get("error")`) are rendered as text, not injected as raw HTML
- [ ] User-supplied values are never interpolated into `<script>` tags or inline event handlers
- [ ] Content-Security-Policy header is set and restricts `script-src` (ideally no `unsafe-inline`)
- [ ] SVG uploads or user-provided image URLs are not rendered in a way that allows embedded scripts

## 15. Cross-Site Request Forgery (CSRF)

- [ ] State-changing endpoints (POST, PATCH, DELETE) are not triggered by simple GET requests
- [ ] Auth cookies use `SameSite=Lax` or `SameSite=Strict`
- [ ] OAuth flows use a state parameter validated on callback (also in section 9)
- [ ] Logout form uses POST, not a GET link
- [ ] If custom CSRF tokens are used, they are validated server-side on every state-changing request

## 16. SQL Injection / Query Safety

- [ ] All database queries use parameterized queries or the ORM's query builder (no raw string concatenation)
- [ ] Any use of `$queryRaw` or `$executeRaw` in Prisma uses tagged template literals (parameterized), not string interpolation
- [ ] User input used in `where` clauses is passed through ORM methods, never concatenated into query strings
- [ ] The `status` query parameter in `GET /api/users` is validated against the enum before being passed to Prisma (or Prisma rejects invalid values safely)

## 17. Input Validation and Sanitization

- [ ] All API endpoints validate and reject unexpected or malformed request bodies
- [ ] File uploads (if any) validate file type, size, and content - not just the extension
- [ ] Numeric inputs are parsed and range-checked (no unbounded values passed to queries or allocations)
- [ ] String inputs that end up in URLs, redirects, or headers are validated to prevent injection (CRLF, open redirect)
- [ ] JSON parsing errors are caught and return 400, not 500 with a stack trace
- [ ] Query parameters used for filtering (e.g. `status`, `scopeId`) are validated against allowed values

## 18. HTTP Header Hardening

- [ ] `Strict-Transport-Security` (HSTS) header is set in production
- [ ] `X-Content-Type-Options: nosniff` header is set
- [ ] `X-Frame-Options: DENY` or `SAMEORIGIN` is set (or equivalent CSP `frame-ancestors`)
- [ ] `Referrer-Policy` is set to `strict-origin-when-cross-origin` or stricter
- [ ] `Permissions-Policy` restricts unnecessary browser features (camera, microphone, geolocation)
- [ ] Server version headers (`X-Powered-By`, `Server`) are suppressed or removed
- [ ] CORS `Access-Control-Allow-Origin` is not set to `*` on authenticated endpoints
- [ ] CORS `Access-Control-Allow-Credentials` is only used with specific origins, never with `*`

## 19. Dependency Security

- [ ] No known critical/high CVEs in direct dependencies (`pnpm audit` or equivalent)
- [ ] Lock file (`pnpm-lock.yaml` or equivalent) is committed and used for deterministic installs
- [ ] Dependencies are reasonably up to date (especially security-sensitive ones: auth libraries, crypto, ORM)
- [ ] No unnecessary dependencies that increase attack surface
- [ ] Dev dependencies are not bundled into the production build

## 20. Error Handling and Information Leakage

- [ ] Stack traces are never returned in API responses in production
- [ ] Database errors are caught and return generic messages, not raw Prisma/SQL errors
- [ ] 500 errors return a generic message without internal details
- [ ] Error responses have a consistent shape across all endpoints (e.g. `{ error: string }`)
- [ ] Debug or verbose logging is disabled in production
- [ ] Environment variables and config values are never included in error responses
- [ ] The `/api/auth/callback/[provider]` catch-all does not forward raw provider errors to the client

## 21. Sensitive Data Exposure

- [ ] API responses never include password hashes, tokens, or session secrets
- [ ] User listing endpoints return only necessary fields (no password, no internal IDs that leak sequence info)
- [ ] The session endpoint does not return more user data than the client needs
- [ ] Database backups and dev.db files are in `.gitignore`
- [ ] `console.log` statements in production code do not output sensitive request bodies or auth tokens
- [ ] Prisma query results are mapped to response shapes - full model objects are not returned directly
- [ ] Access tokens and refresh tokens from OAuth providers are not exposed to the client

## 22. Open Redirect

- [ ] Redirect targets after login are validated against an allowlist or restricted to relative paths
- [ ] The `redirectTo` field in login responses cannot be set to an arbitrary external URL by the client
- [ ] SSO callback redirect targets are server-controlled, not taken from query parameters
- [ ] The `callbackURL` passed to Better Auth `signInSocial` is constructed server-side

## 23. File System and Server Configuration

- [ ] The `public/` directory does not contain sensitive files (backups, config, source maps in production)
- [ ] Source maps are not deployed to production (or are restricted to authenticated error reporting)
- [ ] `.env`, `.env.local`, and similar files are in `.gitignore`
- [ ] The Prisma SQLite dev database (`dev.db`) is in `.gitignore`
- [ ] No temporary or generated files are committed that could contain secrets
- [ ] `next.config` does not expose internal paths or rewrites that bypass auth

## 24. API Design and Miscellaneous

- [ ] DELETE and destructive PATCH endpoints require appropriate authorization
- [ ] Bulk endpoints (list users, export audit) have pagination or result limits to prevent DoS
- [ ] Large response payloads are bounded (no unbounded `findMany` without `take`/`limit`)
- [ ] Timestamps in responses use a consistent format (ISO 8601)
- [ ] API versioning or stability expectations are documented if the API is consumed externally
- [ ] The `[provider]` dynamic route segment in the auth callback cannot be abused to proxy requests to arbitrary OAuth providers not configured in Better Auth

---

## How to Use This Checklist

1. For each item, search the codebase for the relevant code path.
2. Mark `[x]` if the behavior is verified, `[-]` if not applicable, or leave `[ ]` if it fails.
3. For failures, note the file and line, and whether it is a bug, a missing feature, or an accepted risk.
4. Sections 1-10 cover auth flow correctness. Sections 11-24 cover broader application security.
5. When a review is complete, copy the reviewed result into `specs/<feature>/reviews/` with a date in the filename.
