# Implementation Plan: Auth Security Hardening

**Branch**: `010-auth-security-hardening` | **Date**: 2026-04-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-auth-security-hardening/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Harden existing authentication and user-management API routes against brute-force abuse, unsafe proxy trust, unverified SSO fallback identity, unvalidated status filters, and missing audit trail coverage. Add in-memory per-IP rate limiting (5 attempts / 15 min) to login and change-password endpoints, tighten the `getExternalOrigin` function to reject arbitrary forwarded headers when no `AUTH_BASE_URL` is set, remove the unsigned `id_token` JWT decode fallback in `fetchAzureUserProfile`, validate user-status filter inputs against the `UserStatus` enum, integrate the existing `logAudit` function into all auth and user-admin routes, enforce password complexity in `prisma/seed.ts`, and gate the E2E mock SSO shortcut behind `NODE_ENV !== "production"`.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 16 (App Router)
**Primary Dependencies**: BetterAuth, Prisma 7, bcryptjs, next-intl
**Storage**: SQLite (local), PostgreSQL (Docker/prod) via Prisma 7
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Node.js server (Docker, single instance)
**Project Type**: Web application (App Router API routes + React frontend)
**Performance Goals**: N/A (internal business app, ~10 users)
**Constraints**: Single-instance deployment; in-memory rate limit state acceptable
**Scale/Scope**: ~10 concurrent users, single instance, no horizontal scaling

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                | Status | Notes                                                                                                     |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------------- |
| I. Simplicity First      | PASS   | In-memory Map for rate limits; no new dependencies; reuse existing `logAudit` function                    |
| II. Test Coverage        | PASS   | Each user story requires unit + integration tests; plan includes test tasks                               |
| III. Duplication Control | PASS   | Single rate limiter utility shared by login and change-password routes                                    |
| IV. Incremental Delivery | PASS   | Three user stories (P1→P2→P3) implemented in priority order                                               |
| V. Spec Sequencing       | PASS   | No older unfinished specs in ACTIVE_SPECS.md                                                              |
| VI. Continuity & Handoff | PASS   | CONTINUE.md reviewed; will update after implementation                                                    |
| VII. Azure OpenAI        | N/A    | No AI features in this hardening scope                                                                    |
| VIII. Web App Standards  | PASS   | No new routes or UI; existing base path respected                                                         |
| IX. Internationalization | PASS   | Rate limit error messages use existing `jsonError` pattern; i18n keys needed for any new user-facing text |
| X. Responsive Design     | N/A    | No UI changes in scope                                                                                    |

**Gate result**: PASS — no violations, proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/010-auth-security-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/api/
│   ├── auth/
│   │   ├── login/route.ts           # Add rate limiting + audit logging
│   │   ├── logout/route.ts          # Add audit logging
│   │   ├── change-password/route.ts # Add rate limiting + audit logging
│   │   └── sso/azure/route.ts       # Gate mock SSO; handled by BetterAuth for real SSO
│   └── users/
│       ├── route.ts                 # Validate status filter + audit user creation
│       └── [id]/
│           ├── approve/route.ts     # Add audit logging
│           ├── deactivate/route.ts  # Add audit logging
│           ├── reactivate/route.ts  # Add audit logging
│           └── role/route.ts        # Add audit logging
├── lib/
│   ├── rate-limit.ts                # NEW: in-memory per-IP rate limiter
│   ├── audit.ts                     # Existing: wrap with try/catch for log-and-continue
│   ├── auth.ts                      # Existing: password validation (no changes needed)
│   ├── azure-auth.ts                # Tighten getExternalOrigin + remove id_token fallback
│   └── better-auth.ts              # Tighten trustedProxyHeaders
├── i18n/messages/                   # Add rate-limit error translation keys (all 5 locales)
prisma/
└── seed.ts                          # Add password complexity validation

tests/
├── unit/
│   └── rate-limit.test.ts           # NEW: rate limiter unit tests
└── integration/                     # Auth hardening integration tests
```

## Complexity Tracking

No constitution violations — table not required.
