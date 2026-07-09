# Quickstart: API Route Refactor

**Feature**: 011-route-refactor | **Date**: 2026-04-01

## Prerequisites

- Node.js 20+
- Project dependencies installed with `pnpm install`
- Database initialized for local development
- Existing route tests passing before the refactor starts

## Implementation Order

1. Create `C:\dev\webapp-template\src\services\api\` and move route-specific orchestration there, while keeping infrastructure helpers such as Prisma/auth wrappers in `src/lib`.
2. Refactor the user-admin routes first:
   - `src/app/api/users/route.ts`
   - `src/app/api/users/[id]/approve/route.ts`
   - `src/app/api/users/[id]/deactivate/route.ts`
   - `src/app/api/users/[id]/reactivate/route.ts`
   - `src/app/api/users/[id]/role/route.ts`
   - `src/app/api/users/[id]/theme/route.ts`
3. Extract shared audit filter handling for:
   - `src/app/api/audit/route.ts`
   - `src/app/api/audit/export/route.ts`
4. Refactor operational/auth routes only after the first two increments are stable:
   - `src/app/api/background-jobs/route.ts`
   - `src/app/api/auth/login/route.ts`
   - `src/app/api/auth/change-password/route.ts`
   - `src/app/api/auth/logout/route.ts`
5. Leave document-version and AI orchestration as design-only placeholders until those domains exist in this starter or a downstream app.

## Verification

```powershell
# Focused regression pass
pnpm exec vitest run tests/unit/auth tests/unit/background-jobs-route.test.ts tests/unit/users-status-filter.test.ts tests/unit/audit-trail.test.ts

# Duplication gate
pnpm run duplication

# Standard validation gate
.\validate.ps1 all
```

## Manual Smoke Checks

- Confirm `/api/users?status=ACTIVE` and invalid status behavior stay unchanged.
- Confirm `approve`, `deactivate`, `reactivate`, and `role` routes still return the same success/error payloads for admin and non-admin callers.
- Confirm `/api/audit` and `/api/audit/export` accept the same query parameters and export formats as before.
- Confirm `/api/background-jobs` still restricts non-admin users to their own jobs.
- Confirm auth login/change-password/logout responses and audit side effects remain unchanged.

## Planned Output Locations

- Shared services: `C:\dev\webapp-template\src\services\api\...`
- Existing route entrypoints remain in `C:\dev\webapp-template\src\app\api\...`
- Regression tests remain in `C:\dev\webapp-template\tests\unit\...`
