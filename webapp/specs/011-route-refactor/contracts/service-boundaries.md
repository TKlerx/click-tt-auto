# Service Boundary Contract: API Route Refactor

**Feature**: 011-route-refactor | **Date**: 2026-04-01

This document defines the intended internal boundary between App Router entrypoints and new shared route services.

## Route Entrypoints Own

- Exported HTTP verb functions (`GET`, `POST`, `PATCH`, etc.)
- Reading `Request`, query params, and dynamic route params
- Route-specific validation that directly shapes the public contract
- Final `Response` construction when payload shape or headers are endpoint-specific

## Shared Services Own

- Reusable authenticated-user and admin-context loading
- Managed-user lookup and repeated mutation orchestration
- Shared audit filter parsing and normalization that must stay identical across list/export routes
- Shared background-job list/create orchestration that does not alter endpoint payloads
- Authenticated auth-route payload shaping and mutation orchestration for password change, logout, and session lookups
- Future document-version and AI orchestration contracts when those route families exist

## Result Shapes

- Authorization/context helpers may return `{ error: Response } | { ...context }` to preserve the current route short-circuit pattern.
- Shared mutation services should return plain data needed by the route, not a prebuilt generic success response.
- Shared services must not rewrite or standardize existing error messages.

## Design Guardrails

- Do not introduce a generic route factory or declarative middleware DSL.
- Do not hide route-specific audit hooks or status checks inside opaque configuration blobs.
- Prefer one clearly named service per repeated concern over one service that tries to own every route family.
- If a route has only trivial framework boilerplate duplication, leave it alone.

## Implemented Service Surface

- `src/services/api/route-context.ts`
- `src/services/api/user-admin.ts`
- `src/services/api/audit-filters.ts`
- `src/services/api/background-jobs.ts`
- `src/services/api/auth.ts`
- `src/services/api/session.ts`

## Future Extension Contract

When document-version or AI request routes are introduced in this starter or a downstream app:

- version mutation helpers must wrap parent/version writes in Prisma `$transaction`
- AI orchestration helpers must keep operation-specific dedupe and enqueue rules visible
- route handlers must still own their exact public response contracts
