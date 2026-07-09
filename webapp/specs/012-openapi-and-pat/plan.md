# Implementation Plan: OpenAPI Specification & Personal Access Tokens

**Branch**: `012-openapi-and-pat` | **Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-openapi-and-pat/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Add Personal Access Token (PAT) authentication for programmatic API access, a browser-based CLI login flow, an OpenAPI 3.1 specification for all endpoints, and a browsable API documentation page. PATs use prefixed opaque tokens (`<PREFIX>_<random>`) with one-way hashing, support create/revoke/renew/delete lifecycle, and enforce the same RBAC as session auth. The CLI browser login flow uses a localhost callback with OAuth2-style state parameter for CSRF protection.

## Technical Context

**Language/Version**: TypeScript with Next.js 16 (App Router)
**Primary Dependencies**: Prisma 7, BetterAuth, bcryptjs, next-intl, zod (existing); no new major dependencies expected — OpenAPI spec is hand-maintained YAML served as static, docs UI uses a lightweight embedded viewer
**Storage**: SQLite (local dev) / PostgreSQL (production) via Prisma
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web application served under configurable base path
**Project Type**: Web service (Next.js App Router)
**Performance Goals**: Token auth lookup < 50ms per request; API docs page loads < 3s
**Constraints**: Must work behind nginx reverse proxy with base path; must work with Azure SSO; i18n for all UI text; mobile-responsive
**Scale/Scope**: Small team (~10 users), max 10 active tokens per user

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                | Status | Notes                                                                       |
| ------------------------ | ------ | --------------------------------------------------------------------------- |
| I. Simplicity First      | PASS   | Standard CRUD + auth middleware pattern, no unnecessary abstractions        |
| II. Test Coverage        | PASS   | Test tasks required for every user story                                    |
| III. Duplication Control | PASS   | Token auth middleware is a single shared function in route-context          |
| IV. Incremental Delivery | PASS   | P1 (PAT CRUD + auth) → P2 (OpenAPI docs, CLI login) → P3 (X-API-Key, admin) |
| V. Spec Sequencing       | PASS   | 010 and 011 fully implemented; 012 is next                                  |
| VI. Continuity           | PASS   | CONTINUE.md will be updated                                                 |
| VII. Azure OpenAI        | N/A    | No AI features in this spec                                                 |
| VIII. Web Standards      | PASS   | Base path compliance, toast notifications, i18n                             |
| IX. Internationalization | PASS   | All PAT management UI uses translation keys                                 |
| X. Responsive Design     | PASS   | Token management UI must work on mobile                                     |

## Project Structure

### Documentation (this feature)

```text
specs/012-openapi-and-pat/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-endpoints.md
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   ├── tokens/                    # PAT CRUD API routes
│   │   │   ├── route.ts               # GET (list), POST (create)
│   │   │   └── [id]/
│   │   │       ├── route.ts           # DELETE
│   │   │       ├── revoke/route.ts    # POST (revoke)
│   │   │       └── renew/route.ts     # POST (renew)
│   │   ├── cli-auth/                  # CLI browser login flow
│   │   │   ├── authorize/route.ts     # GET (initiate, redirect to login)
│   │   │   └── token/route.ts         # POST (exchange code for token)
│   │   ├── openapi/route.ts           # GET (serve OpenAPI YAML)
│   │   └── admin/
│   │       └── tokens/                # Admin token management
│   │           ├── route.ts           # GET (list all tokens)
│   │           └── [id]/
│   │               ├── revoke/route.ts
│   │               └── route.ts       # DELETE
│   ├── (app)/
│   │   ├── settings/
│   │   │   └── tokens/page.tsx        # User PAT management page
│   │   ├── admin/
│   │   │   └── tokens/page.tsx        # Admin token management page
│   │   └── docs/
│   │       └── api/page.tsx           # API documentation viewer
│   └── cli-login/page.tsx             # CLI login landing page (post-auth redirect)
├── services/api/
│   ├── tokens.ts                      # Token service (create, revoke, renew, delete, validate)
│   └── cli-auth.ts                    # CLI auth service (auth codes, token exchange)
├── lib/
│   └── token-auth.ts                  # PAT/X-API-Key middleware (extends route-context)
├── components/
│   └── tokens/                        # Token management UI components
│       ├── token-list.tsx
│       ├── create-token-dialog.tsx
│       └── token-value-display.tsx
└── i18n/messages/
    ├── en.json                        # + tokens namespace
    ├── de.json
    ├── es.json
    ├── fr.json
    └── pt.json

prisma/
├── schema.prisma                      # + PersonalAccessToken, CliAuthCode models
└── schema.postgres.prisma             # + same models

tests/
├── unit/
│   ├── token-service.test.ts
│   └── token-auth.test.ts
├── integration/
│   ├── token-api.test.ts
│   ├── cli-auth.test.ts
│   └── openapi.test.ts
└── e2e/
    ├── token-management.spec.ts
    └── api-docs.spec.ts

public/
└── openapi.yaml                       # OpenAPI 3.1 spec (or generated at build time)
```

**Structure Decision**: Follows existing project conventions — API routes under `src/app/api/`, services under `src/services/api/`, shared auth logic in `src/lib/`. UI pages follow App Router conventions with `(app)` route group. Token management UI components are co-located under `src/components/tokens/`.
