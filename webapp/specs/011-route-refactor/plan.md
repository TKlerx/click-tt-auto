# Implementation Plan: API Route Refactor

**Branch**: `011-route-refactor` | **Date**: 2026-04-01 | **Spec**: `C:\dev\webapp-template\specs\011-route-refactor\spec.md`
**Input**: Feature specification from `C:\dev\webapp-template\specs\011-route-refactor\spec.md`

**Required First Step**: Read `C:\dev\webapp-template\CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward. Completed during planning.

## Summary

Refactor the current Next.js App Router API handlers so repeated authorization, managed-user loading, audit filter parsing, and small route orchestration steps move into app-level shared services under `src/services`, while preserving every existing endpoint contract. This plan focuses only on the route families that currently exist and are intentionally in scope in this starter: users, audit, background jobs, and authenticated auth routes.

## Technical Context

**Language/Version**: TypeScript 5.9 on Next.js 16 App Router (React 19)  
**Primary Dependencies**: Next.js 16, React 19, Prisma 7, Better Auth, Zod, Vitest, Playwright, jscpd  
**Storage**: Prisma with SQLite for local development and PostgreSQL for Docker/shared deployments  
**Testing**: Vitest unit tests, Playwright E2E tests, `validate.ps1` quality gate (`typecheck`, `lint`, `duplication`, `semgrep`, tests)  
**Target Platform**: Node.js-hosted Next.js web application with browser clients and App Router API endpoints  
**Project Type**: Web application  
**Performance Goals**: No material latency regression for existing API routes; avoid adding extra database round-trips unless a shared helper replaces duplicate work overall  
**Constraints**: Preserve exact status codes, response shapes, and current error messages; keep route entrypoints readable; place new shared orchestration in `src/services`; keep repo duplication under the existing 3% jscpd threshold or document intentional route-entrypoint exceptions; do not invent schema changes for domain models that are absent from the current starter  
**Scale/Scope**: Single application, 18 current API route files under `src/app/api`, single-instance deployment, ~10 users per constitution

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status                            | Notes                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Simplicity First               | PASS                              | Plan uses thin route handlers plus narrow service helpers; no generic middleware DSL or framework abstraction layer.                                                                                                                                                                                   |
| II. Test Coverage                 | PASS                              | Implementation will keep existing route tests passing, add helper-focused unit coverage where extraction introduces risk, and run `validate.ps1 all` before merge.                                                                                                                                     |
| III. Duplication Control          | PASS                              | Local jscpd on `src/app/api` currently reports 5.74% duplication, especially in user status and audit routes; these are the first refactor targets and the duplication policy is documented in `research.md` and `contracts/`.                                                                         |
| IV. Incremental Delivery          | PASS                              | Increments are ordered by business value and risk: user-admin route helpers first, then audit/background-job helpers, then auth-route cleanup.                                                                                                                                                         |
| V. Spec Sequencing And Completion | PASS WITH USER-CONFIRMED OVERRIDE | `specs/OVERVIEW.md` marks `010-auth-security-hardening` as fully implemented, but the active branch and `CONTINUE.md` still reference `010`. The user explicitly requested planning for `011-route-refactor` on 2026-04-01, so this newer-spec planning proceeds with that confirmation recorded here. |
| VI. Continuity And Handoff        | PASS WITH FOLLOW-UP REQUIRED      | `CONTINUE.md` lists `010` and `011` as active while `ACTIVE_SPECS.md` says none. Planning can proceed, but implementation should reconcile continuity tracking before coding/merge.                                                                                                                    |
| VII. Azure OpenAI Integration     | PASS                              | No provider changes are planned. The spec's AI orchestration examples are documented as future extension points only because no AI routes exist in this starter.                                                                                                                                       |
| VIII.-X. Web/App Standards        | PASS                              | This is an internal API refactor; route behavior remains unchanged and existing base-path, i18n, and responsive UI constraints are unaffected.                                                                                                                                                         |

**Gate Result (Pre-Phase 0)**: PASS for planning. No unresolved clarifications remain. Continuity file reconciliation is a required follow-up before implementation is considered complete.

## Project Structure

### Documentation (this feature)

```text
specs/011-route-refactor/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- api-invariants.md
|   `-- service-boundaries.md
`-- tasks.md                 # Phase 2 output, not created by this command
```

### Source Code (repository root)

```text
src/
|-- app/
|   |-- (auth)/
|   |-- (dashboard)/
|   `-- api/
|       |-- audit/
|       |-- auth/
|       |-- background-jobs/
|       |-- health/
|       |-- locale/
|       `-- users/
|-- components/
|-- i18n/
|-- lib/
|-- services/               # planned addition for this feature
`-- instrumentation.ts

tests/
|-- e2e/
`-- unit/

prisma/
worker/
```

**Structure Decision**: Keep the existing single Next.js application layout. Shared route orchestration will move into `C:\dev\webapp-template\src\services\api\...`, while lower-level utilities that are not route-specific remain in `C:\dev\webapp-template\src\lib\...`. Route files under `src/app/api` stay as thin entrypoints that parse HTTP input and preserve endpoint-specific response contracts.

## Phase 0 Research Outcome

Research output is documented in `C:\dev\webapp-template\specs\011-route-refactor\research.md`.

Key decisions:

- Introduce a dedicated `src/services/api` layer for route orchestration rather than expanding `src/lib`.
- Refactor the current duplication hotspots first: user status routes and audit query parsing/export filters.
- Preserve the existing `{ error: Response } | { ... }` short-circuit pattern for authorization helpers to minimize route churn.
- Treat document-version mutation and AI enqueue flows as future contract placeholders because the current starter has no matching routes or Prisma models.
- Keep route-entrypoint boilerplate acceptable only for HTTP export wiring, request parsing, and final response shaping; repeated business logic must move to services.

## Phase 1 Design Outputs

Design artifacts produced for this plan:

- `C:\dev\webapp-template\specs\011-route-refactor\data-model.md`
- `C:\dev\webapp-template\specs\011-route-refactor\contracts\api-invariants.md`
- `C:\dev\webapp-template\specs\011-route-refactor\contracts\service-boundaries.md`
- `C:\dev\webapp-template\specs\011-route-refactor\quickstart.md`

Planned design shape:

1. Shared route context helpers
   `requireRouteUser`, admin-only context loaders, and managed-user lookup helpers remain narrow and route-oriented.
2. Shared orchestration services
   User status mutations, audit filter parsing, and background-job request handling become service calls so route handlers mostly coordinate HTTP semantics.
3. Contract preservation
   Response payloads, status codes, and current error-message text stay route-owned and unchanged.

## Post-Design Constitution Check

| Principle                    | Status                       | Notes                                                                                                                                  |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Simplicity First             | PASS                         | Design keeps services small and domain-specific; no speculative generic router framework is introduced.                                |
| Test Coverage                | PASS                         | Quickstart and contracts call for existing route regression tests plus new service tests where behavior is extracted.                  |
| Duplication Control          | PASS                         | Design addresses the measured jscpd hotspots and documents acceptable residual route duplication.                                      |
| Incremental Delivery         | PASS                         | The plan still supports story-by-story implementation without broad cross-cutting rewrites.                                            |
| Spec Sequencing / Continuity | PASS WITH FOLLOW-UP REQUIRED | The explicit user request for `011` is recorded, but repo continuity files still need reconciliation before implementation is wrapped. |

**Gate Result (Post-Phase 1)**: PASS for design completion. The only non-feature follow-up is continuity-file cleanup before or alongside implementation.

## Phase 2 Implementation Preview

1. Increment 1 (P1)
   Extract admin/user route context helpers and consolidate the `approve`, `deactivate`, `reactivate`, `role`, and `theme` route families without changing responses.
2. Increment 2 (P1 support)
   Extract shared audit filter parsing and background-job request helpers, keeping route-specific export/list behavior intact.
3. Increment 3 (cleanup)
   Apply the same thin-route pattern to auth routes where duplication remains behaviorally sensitive and covered by existing tests.

## Complexity Tracking

| Violation                                                       | Why Needed                                                            | Simpler Alternative Rejected Because                                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Newer spec planned while repo continuity still references `010` | User explicitly requested `011-route-refactor` planning on 2026-04-01 | Waiting for continuity cleanup would block requested planning work even though `specs/OVERVIEW.md` already marks `010` complete |
