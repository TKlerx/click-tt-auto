# Quickstart: Auth Security Hardening

**Feature**: 010-auth-security-hardening | **Date**: 2026-04-01

## Prerequisites

- Node.js 20+
- Project dependencies installed (`pnpm install`)
- Database initialized (`pnpm run prisma:migrate && pnpm run prisma:seed`)
- `.env` file configured (copy from `.env.example`)

## What This Feature Changes

1. **Rate limiting** on login and change-password endpoints (5 attempts / 15 min per IP, in-memory)
2. **Proxy trust hardening** — forwarded headers only trusted when `AUTH_BASE_URL` is explicitly set
3. **SSO identity safety** — removes unsigned id_token fallback; mock SSO blocked in production
4. **Status filter validation** — `/api/users?status=INVALID` now returns 400 instead of failing silently
5. **Audit trail** — all auth and user-admin actions now create audit entries
6. **Seed password validation** — initial admin password must meet complexity requirements

## Files Changed

### New files

- `src/lib/rate-limit.ts` — In-memory rate limiter utility
- `tests/unit/rate-limit.test.ts` — Rate limiter unit tests

### Modified files

- `src/app/api/auth/login/route.ts` — Rate limiting + audit
- `src/app/api/auth/logout/route.ts` — Audit
- `src/app/api/auth/change-password/route.ts` — Rate limiting + audit
- `src/app/api/auth/sso/azure/route.ts` — Production gate on mock SSO
- `src/app/api/users/route.ts` — Status filter validation + audit
- `src/app/api/users/[id]/approve/route.ts` — Audit
- `src/app/api/users/[id]/deactivate/route.ts` — Audit
- `src/app/api/users/[id]/reactivate/route.ts` — Audit
- `src/app/api/users/[id]/role/route.ts` — Audit
- `src/lib/audit.ts` — Add `safeLogAudit` wrapper (log-and-continue)
- `src/lib/azure-auth.ts` — Remove id_token fallback, tighten `getExternalOrigin`
- `src/lib/better-auth.ts` — Conditional `trustedProxyHeaders`
- `prisma/schema.prisma` — Add `AUTH_PASSWORD_CHANGED` to AuditAction enum
- `prisma/seed.ts` — Add password complexity validation

## How to Verify

```bash
# Run all checks
pnpm run validate

# Run unit tests (includes rate limiter tests)
pnpm test

# Run E2E tests
pnpm run test:e2e

# Manual verification: attempt 6 rapid login failures
# → 6th attempt should return 429 with Retry-After header
```

## Environment Variables

No new environment variables. Existing `AUTH_BASE_URL` behavior is tightened:

- **Set**: Forwarded proxy headers are trusted (existing behavior)
- **Unset**: Only `request.url` origin is used (hardened behavior — forwarded headers ignored)
