# Quickstart: OpenAPI Specification & Personal Access Tokens

**Date**: 2026-04-09

## Prerequisites

- Node.js and pnpm installed
- Project dependencies installed (`pnpm install`)
- Database migrated (`pnpm run prisma:migrate`)
- Dev server running (`pnpm run dev`)
- Seeded admin user available

## Development Sequence

### 1. Database Schema

Add `PersonalAccessToken` and `CliAuthCode` models to both `schema.prisma` and `schema.postgres.prisma`. Add `TokenType`, `TokenStatus` enums and new `AuditAction` values. Run migrations for both SQLite and PostgreSQL.

### 2. Token Service

Create `src/services/api/tokens.ts` with functions:

- `createToken(userId, name, expiresInDays, type)` — generates prefixed token, hashes, stores, returns plaintext once
- `validateToken(tokenValue)` — looks up by hash, checks status/expiry/user status, returns user
- `revokeToken(tokenId, userId)` — sets status to REVOKED
- `renewToken(tokenId, userId, expiresInDays)` — generates new value, updates hash/expiry
- `deleteToken(tokenId, userId)` — hard delete
- `listTokens(userId, showAll)` — returns tokens with auto-hide logic

### 3. Token Auth Middleware

Create `src/lib/token-auth.ts` with `resolveTokenUser(request)`. Integrate into `getSessionUser()` or `requireRouteUser()` as a fallback when no session cookie is present. Check `Authorization: Bearer` first, then `X-API-Key`.

### 4. Token API Routes

Create routes under `src/app/api/tokens/` and `src/app/api/admin/tokens/`. Follow existing route patterns (see `src/app/api/users/route.ts`).

### 5. CLI Auth Flow

Create `src/services/api/cli-auth.ts` and routes under `src/app/api/cli-auth/`. Create the `/cli-login` page that reads the session, generates the auth code, and redirects to the CLI's callback URL.

### 6. OpenAPI Specification

Write `openapi.yaml` documenting all endpoints. Create `GET /api/openapi` route to serve it with base path injection. Create the `/docs/api` page with Swagger UI.

### 7. UI Pages

Build token management page at `/settings/tokens` and admin page at `/admin/tokens`. Add i18n keys for all 5 locales.

## Key Files to Reference

- `src/services/api/route-context.ts` — existing auth middleware pattern
- `src/services/api/user-admin.ts` — example service with audit integration
- `src/app/api/users/route.ts` — example route handler pattern
- `src/lib/audit.ts` — audit entry creation
- `prisma/schema.prisma` — current data model
- `src/i18n/messages/en.json` — i18n message structure

## Validation Commands

```bash
pnpm run typecheck     # Type check
pnpm run lint          # Lint
pnpm run test          # Unit tests
pnpm run test:e2e      # E2E tests
pnpm run validate      # All checks
```
