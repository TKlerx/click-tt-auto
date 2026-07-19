# Implementation Plan: Scope Access Management

**Branch**: `007-scope-access-management` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-scope-access-management/spec.md`

## Summary

Let admins assign users to Bezirke and the Verband through the application rather than the database, make an assignment mean exactly one scope everywhere, and let a scope admin actually work in the scopes they hold instead of only looking at them.

Almost nothing here is new construction. `UserScopeAssignment`, the three roles, platform admins seeing every scope, and scoped filtering all exist. The last-admin guard exists. What is missing is any way to **create or remove an assignment**, and any way for a non-platform-admin to **act**. This plan adds one endpoint pair, opens user management to scope admins with server-side authorisation on every action, resolves a genuine disagreement between two access rules, and replaces seven hardcoded role checks with the access levels the codebase already defines but never consults.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js LTS 22.x  
**Primary Dependencies**: Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod — all present; this feature adds none  
**Storage**: PostgreSQL via `webapp/prisma/schema.postgres.prisma`. **No schema change** — `UserScopeAssignment` already exists with `@@unique([userId, scopeId])`  
**Testing**: vitest (unit/integration), Playwright (e2e)  
**Target Platform**: Next.js server + browser  
**Project Type**: Web application, confined to `webapp/`  
**Performance Goals**: No regression. Access checks already run per request  
**Constraints**: No production data, so narrowing access from the hierarchy walk to exact match cannot disrupt a live user. Every authorisation decision must hold at the API independently of the interface  
**Scale/Scope**: 13 Bezirke + Verband + Germany root, seeded. Three roles. Handful of users

**Depends on feature 005**, structurally rather than cosmetically:

- `lib/raster/scope-level.ts` (005's research R-005) — needed by FR-004a to know that Germany is not assignable and that a scope is a Bezirk or the Verband.
- The Raster **step pages** — FR-017 replaces the seven hardcoded checks *where 005 puts them*. Against 004 those checks are still in one 571-line page, and the task means something different.
- Bezirk/Verband terminology (005's FR-022a).

An earlier draft of this plan called the coupling cosmetic and said this could be built against 004 with the labels renamed. That was wrong, and it mattered: acting on it would start the work on a base where `scope-level.ts` and the step pages do not exist.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0.

| Principle | Assessment |
|---|---|
| **I. Focused click-TT Administration Suite** | PASS. Within `webapp/`, capability 3. No new dependency. Principle I explicitly notes that "user login, user administration, and basic role management are provided by the existing baseline" — this extends that administration rather than inventing a parallel one |
| **II. Safety-First Automation** | PASS. Read-only toward click-TT. This feature *narrows* access (FR-011) and adds server-side enforcement where a page-level check was the only guard — both in the principle's direction |
| **III. Credential Security** | PASS. No credentials handled. This is authorisation, not authentication |
| **IV. Idempotent & Resumable** | PASS. FR-005 requires granting an already-held scope to be non-destructive, which `@@unique([userId, scopeId])` plus an upsert gives naturally |
| **V. Observable Output** | PASS, and advanced. FR-030 requires every grant and revoke attributable to an actor. The existing `safeLogAudit` carries it |
| **VI. Quality Gates** | PASS. TypeScript strict, ESLint, Prettier, `webapp/validate.ps1` |

**Result: no violations. Complexity Tracking not required.**

Worth noting rather than filing: FR-016 *widens* what a scope admin may do — from viewing to importing, reviewing and running. That is a real expansion of blast radius, and Principle II's instinct is caution. But the expansion is confined to scopes the user already holds, and the access layer already declares the intent (`scheduler: [PLATFORM_ADMIN, SCOPE_ADMIN]`); the Raster page simply never consults it. This closes a gap between stated and actual behaviour rather than opening a new one. FR-019 (API-side enforcement) is what keeps it honest.

## Project Structure

### Documentation (this feature)

```text
specs/007-scope-access-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── scope-access.md
├── checklists/
│   └── requirements.md  # From /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
webapp/
├── prisma/
│   └── schema.postgres.prisma           # UNCHANGED — UserScopeAssignment already exists
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   └── users/page.tsx           # PLATFORM_ADMIN-gated today; opens to SCOPE_ADMIN, filtered
│   │   └── api/users/[id]/
│   │       ├── scopes/route.ts          # new: grant (POST) / revoke (DELETE)
│   │       └── role/route.ts            # existing: gains a scope-admin ceiling
│   ├── components/auth/
│   │   ├── UserManagementTable.tsx      # existing: scope column, per-row authorisation
│   │   └── ScopeAssignmentDialog.tsx    # new
│   ├── lib/
│   │   ├── rbac.ts                      # checkScopeAccess: already exact-match; gains delegation helpers
│   │   └── raster/access.ts             # ancestor walk removed (FR-011)
│   └── services/api/
│       ├── user-admin.ts                # existing patterns reused; last-admin guard already here
│       └── scope-assignments.ts         # new
└── tests/
    ├── unit/                            # delegation rules, exact-match resolution
    ├── integration/                     # grant/revoke, escalation attempts, search
    └── e2e/                             # scope admin works in their Bezirk
```

**Structure Decision**: Existing web application under `webapp/`, extended in place. **No schema change** — this feature is entirely about giving existing data a way to be created, and existing rules a way to agree with each other. New code is one service, one endpoint pair, one dialog. The rest is subtraction: deleting an ancestor walk, deleting seven hardcoded role checks.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
