# Starter Template Extraction

## Goal

Create a reusable business-app starter from the current codebase while preserving the original product history on `main`.

Working branch: `starter-template-extraction`

Current recommendation:

- the branch is now suitable as the base for a fresh starter repository
- copy or re-home this branch into a new repo instead of merging it back into the original product history

## Keep In Template

- authentication foundation:
  - Azure SSO
  - local login
  - change-password flow
  - pending approval flow
  - sign out
- session and route protection:
  - session provider
  - auth helpers
  - route auth helpers
  - RBAC foundation
- user administration:
  - create local users
  - approve/deactivate/reactivate users
  - role changes
- signed-in home experience:
  - dashboard remains the default authenticated landing page
  - dashboard acts as the user home screen
  - keep a reusable dashboard shell with role-aware summary cards/sections
- UI platform:
  - app shell
  - dashboard shell
  - top bar and navigation
  - toast notifications
  - dark/light theme
  - locale switcher
  - responsive layout patterns
- platform services:
  - generic audit logging
  - generic audit export foundation if renamed away from finance-specific semantics
  - file storage helpers
  - file upload foundation
  - generic file/document preview foundation
  - base-path support
  - validation and hook workflow
- scoped access foundation:
  - keep the neutral scope-assignment pattern so it can represent org/tenant/team/geography assignments
- data and deployment foundation:
  - Prisma migration/generate/seed workflow
  - Docker deployment setup
- quality/tooling:
  - Playwright
  - Vitest
  - Semgrep
  - duplication checks
  - continuity workflow
  - `.specify` constitution/spec/task workflow

## Remove Or Extract From Template

- finance domain schema and flows:
  - budgets
  - budget hierarchies
  - receipts
  - receipt review
  - compliance dashboard
  - donor and project tagging
  - budget proposals
  - budget templates
- finance pages and APIs:
  - `/review`
  - `/compliance`
  - receipt APIs
  - compliance APIs
- finance-specific services:
  - `src/lib/review.ts`
  - `src/lib/receipts.ts`
  - `src/lib/compliance.ts`
  - `src/lib/budget-validation.ts`
  - `src/lib/audit-export.ts`
- finance-specific tests and specs:
  - `specs/001-*`
  - `specs/002-*`
  - review/compliance/receipt tests

## Generalize Before Extraction

- branding:
  - remove any remaining GVI-specific copy in docs and translations
- base path:
  - replace legacy product-specific base-path examples with neutral defaults
- roles:
  - use neutral starter roles:
    - `PLATFORM_ADMIN`
    - `SCOPE_ADMIN`
    - `SCOPE_USER`
- audit types:
  - keep generic audit logging
  - remove finance-specific action enums from the starter
- dashboard content:
  - keep dashboard/home behavior
  - replace finance-specific dashboard widgets with generic starter widgets

## Likely Reusable Core Files

- app shell and providers:
  - `src/app/layout.tsx`
  - `src/app/(dashboard)/layout.tsx`
  - `src/app/(dashboard)/dashboard/page.tsx`
  - `src/components/providers/*`
- auth and session:
  - `src/app/(auth)/*`
  - `src/app/api/auth/*`
  - `src/lib/auth.ts`
  - `src/lib/better-auth.ts`
  - `src/lib/better-auth-route.ts`
  - `src/lib/better-auth-http.ts`
  - `src/lib/azure-auth.ts`
  - `src/lib/route-auth.ts`
- shared UI:
  - `src/components/ui/*`
  - `src/components/auth/*`
- shared infra:
  - `src/lib/audit.ts`
  - `src/lib/audit-export.ts` after generalization
  - `src/lib/db.ts`
  - `src/lib/file-storage.ts`
  - `src/lib/http.ts`
  - `src/lib/base-path.ts`
  - `src/lib/user-management.ts`
- i18n and theme:
  - `src/i18n/*`
  - theme/session/locale APIs and components

## Current Extraction Status

Completed on this branch:

1. Replaced starter branding and package metadata with neutral business-app naming.
2. Renamed roles to `PLATFORM_ADMIN`, `SCOPE_ADMIN`, and `SCOPE_USER`.
3. Removed finance-only review/compliance pages, APIs, libraries, and tests.
4. Replaced the country-specific scoping model with neutral scope naming.
5. Reduced the Prisma schema and migration tree to the reusable starter core.
6. Removed the old finance feature specs from `specs/`.
7. Trimmed locale files to the namespaces the starter still uses.

Likely next slices:

1. Refresh continuity files and commit the current extraction work in logical chunks.
2. Decide later whether `Scope` should stay as-is or be specialized per project into org/tenant/team semantics.
3. Review docs and `.specify` memory for any remaining product-history references that should move out of the starter branch.
4. Optionally tighten naming in tests and helper files for consistency now that the model is neutral.

## Important Notes

- The Prisma schema was the biggest coupling point and has now been reduced to the reusable starter core.
- The starter preserves generic audit logging, but not finance-specific audit action names.
- The starter should keep a role-aware dashboard as the post-login home screen rather than dropping users into a blank shell.
- Continuity files and commit structure should now be the main focus before merging or branching further.
