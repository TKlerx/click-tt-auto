# Specification Quality Checklist: Scope Access Management

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-14  
**Updated**: 2026-07-14 (clarify session: 5 questions asked and answered; all open questions resolved)  
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

**Status: ready for `/speckit.plan`.**

## Notes

### The feature nearly shipped as "read-only access to a Bezirk"

The clarify session's first question changed the shape of this feature. A scope assignment currently grants **viewing and nothing else**: `access.ts` defines a `scheduler` level covering `PLATFORM_ADMIN` and `SCOPE_ADMIN`, but the Raster page never consults it and hardcodes `Role.PLATFORM_ADMIN` in seven places — every source upload, input-set creation, capacity edit, run start, and manual assignment. `SCOPE_ADMIN` is therefore indistinguishable from `SCOPE_USER` in Raster today.

Without asking, this spec would have delivered a way to grant someone the right to look at a Bezirk while every run in all 13 still routed through a platform admin. User Story 2 and FR-016 to FR-019 exist because of that answer, and they are most of the feature's value.

### What the ask turned out to be

Roles, `UserScopeAssignment`, platform admins seeing everything, and scoped filtering all exist. Two things do not: any way to **create or remove an assignment** (the users API has approve, deactivate, reactivate, role, theme — nothing for scopes), and any way for a non-platform-admin to **act** on a scope. This feature is those two things.

### Decisions worth not re-deriving

- **Exact match wins** (FR-010, FR-011). `rbac.ts` matched exactly; `raster/access.ts` walked to grandparent. Blast radius is smaller than it first appeared — `checkScopeAccess` has exactly one caller (`route-context.ts:80`) — but the two rules genuinely disagreed and the Verband case made it visible.
- **Runs survive revocation** (FR-032 to FR-034). A run is the scope's work, not the individual's. Cancelling a long CP-SAT run because someone changed jobs destroys work the Bezirk still needs.
- **Search, don't browse** (FR-026 to FR-029). Scope admins need to grant a first scope to someone holding none, which rules out "only show users in my scopes"; exact-identifier search gets that without handing every Bezirk admin the org's user directory.
- **Lockout is prevented** (FR-012a). Zero platform admins means no scope administration and no recovery except editing the database — the exact thing this feature removes the need for.
- **Germany is not assignable** (FR-004a). Under exact-match it would grant access to nothing.

### Live risks

- **FR-017 is the risky one.** Replacing seven page-level platform-admin checks with level-based checks widens who can act. Each needs its own API-side enforcement (FR-019); the page gate is not a security boundary. Getting one wrong grants a scope user the ability to start runs.
- **FR-025 opens user management to a new role.** The page is gated once, in the page component. Widening it means every action needs its own authorisation.
- **FR-021 to FR-024 are the escalation surface.** A scope admin must not grant beyond their own scopes or raise a role above their own, enforced at the API regardless of what the UI offers.

### Deferred deliberately

- **The WTTV-wide scheduler** (FR-014, FR-015). A known goal, blocked on the organisation establishing the role, gated on the same business change as feature 006. Not built; kept buildable. FR-015 matters more than it looks: if granting 13 Bezirke is tedious enough, someone will reach for a platform admin grant instead, which is the conflation this avoids.
- **Scope creation** stays with seeding. This feature assigns users to scopes; it does not manage the hierarchy.
- **Source inheritance** (`003` FR-008c) governs where source material is valid, not who may see it. Untouched.
