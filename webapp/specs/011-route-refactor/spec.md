# Feature Specification: API Route Refactor

**Feature Branch**: `011-route-refactor`  
**Created**: 2026-04-01  
**Status**: Tasked  
**Input**: User description: "Refactor API routes to reduce boilerplate and preserve behavior through shared route helpers and services"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Safer Route Changes (Priority: P1)

As a developer, I want common authentication, access, and document-loading logic centralized so that route changes are easier to make without introducing inconsistent authorization or missing guardrails.

**Why this priority**: This gives the most immediate engineering value and reduces the highest-risk source of regressions: repeated security-sensitive route boilerplate.

**Independent Test**: Refactor one representative route family to use the shared helpers, then verify the existing unit and integration tests for that family still pass with unchanged external behavior.

**Acceptance Scenarios**:

1. **Given** a route that currently performs `requireApiUser`, campaign access checks, and document lookup inline, **When** the route is refactored to use shared helpers, **Then** the response shape, status codes, and authorization behavior remain unchanged.
2. **Given** an unauthorized or missing-resource request, **When** the shared helper path is used, **Then** the route returns the same error responses that callers already depend on.

---

### Edge Cases

- What happens when a shared helper is too generic and starts obscuring route-specific behavior? The refactor must stop short of abstractions that make route intent harder to read.
- How does the system handle route families with superficially similar flows but different audit or validation requirements? Shared helpers must allow route-specific hooks or remain narrowly scoped.
- What happens if a helper changes a status code, error message, or response shape by accident? Existing route tests must catch this, and additional regression tests should be added where current coverage is thin.
- How should duplication checks treat framework boilerplate such as Next.js route entrypoints? The refactor should reduce meaningful duplication, but duplication tooling may still need scoped exclusions for framework patterns.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The refactor MUST preserve the public API behavior of the currently targeted route families in this starter: `/api/users`, `/api/users/[id]/*`, `/api/audit`, `/api/audit/export`, `/api/background-jobs`, `/api/auth/change-password`, `/api/auth/logout`, and `/api/auth/session`.
- **FR-002**: The system MUST provide shared helpers or services, organized in a dedicated `services/` directory at the app level (e.g., `frontend/src/services/`), for repeated route concerns where duplication is both common and behaviorally sensitive, including auth/access context loading and document/version loading.
- **FR-003**: The system MUST preserve route-specific validation, audit behavior, side effects, and existing error response formats (including status codes and response shapes) even when common logic is extracted. Error responses MUST NOT be standardized as part of this refactor.
- **FR-004**: The refactor MUST keep route code readable; abstractions that hide core business behavior or make debugging materially harder are not acceptable.
- **FR-005**: Existing automated tests for affected routes MUST continue to pass after the refactor, and new regression tests MUST be added where helper extraction introduces risk not already covered.
- **FR-006**: The duplication-check strategy MUST be documented for route files so the team has an explicit policy on what route-level duplication is expected versus what should be refactored.

### Key Entities _(include if feature involves data)_

- **Route Context**: A reusable object or helper result containing the authenticated user, campaign access result, path params, and optionally loaded document/version resources needed by a route.
- **Managed User Context**: A reusable service result containing the acting admin, the target user, and the route-safe error outcome for status, role, or theme changes.
- **Audit Filter Input**: A shared route-service model representing validated audit list/export filters without changing the existing API contract.
- **Background Job Request Context**: A shared service input that preserves current list/create behavior while centralizing request parsing and mapping.

## Clarifications

### Session 2026-04-01

- Q: Which route families are in scope for this refactor? → A: All API routes in the project.
- Q: Where should extracted shared helpers and services live? → A: Dedicated `services/` directory at the app level (e.g., `frontend/src/services/`).
- Q: Should version mutation operations be wrapped in a database transaction? → A: Always wrap in a Prisma `$transaction` (atomic guarantee).
- Q: Should the refactor standardize error response formats across routes? → A: No; preserve existing error responses exactly, even if inconsistent across routes.

## Deferred Follow-Ups

- Shared document-version mutation services should be handled in a future spec once document/version route families exist in this starter or a downstream app.
- Shared AI enqueue orchestration should be handled in a future spec once analysis/rewrite route families exist in this starter or a downstream app.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Developers can refactor at least two route families to shared helpers/services with no externally observable API behavior changes.
- **SC-002**: All pre-existing tests for affected route families continue to pass after the refactor.
- **SC-003**: The amount of repeated route boilerplate in the targeted route families is materially reduced, as confirmed by code review and localized duplication analysis.
- **SC-004**: The team has a documented and accepted duplication policy for route entrypoints versus shared business logic, reducing future ambiguity about what the dedupe gate should enforce.
