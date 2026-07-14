# Specification Quality Checklist: Combined WTTV Planning

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-14  
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

**Status: User Story 1 is ready for `/speckit.plan`. User Story 2 should not be planned until Q1 is answered.**

## Notes

- **Q1 is the whole risk of this feature.** Whether the existing CP-SAT optimizer can solve the Verband plus 13 Bezirke in acceptable time is unestablished, and FR-013 makes the problem harder rather than merely bigger: unfixing the upper-league Rasterzahlen adds decision freedom. Recommend a feasibility spike against real or realistic data before planning User Story 2. If it fails, this spec's shape changes — decomposition or a different objective — while User Story 1 survives untouched.
- **The priority order front-loads the safe value.** User Story 1 (readiness overview) has no solver risk, is useful every season regardless of whether combined running ever ships, and answers the question that gates everything else. It is deliberately P1 even though it is not the point of the feature.
- **FR-013 is the feature's actual value, and it is easy to miss.** Combined planning is not "one big run" — it removes a sequencing dependency. Today a Bezirk inherits the Verband's already-decided upper-league Rasterzahlen as hard constraints, so Bezirk plans are downstream of a decision made without knowledge of their cost. `specs/003-raster-review-webapp/spec.md` records both halves of this: the optimizer runs "respecting the fixed upper-league Rasterzahlen ... as constraints", and "a full WTTV or district run may proceed with zero fixed numbers".
- **This feature was deferred once already, deliberately.** `specs/003-raster-review-webapp/spec.md` scoped the first release to district scale and named county-wide scale (~1,400 clubs/teams) as a later step the data model should not preclude. This spec is that later step; it is not new scope creep.
- **One data-model change**: FR-011, an input set spanning several scopes. Feature 005's FR-026 exists to keep it buildable — if 005's scope reference is designed as a single hard foreign key with no room for a spanning variant, this feature pays for it.
- **The gate is organizational, not technical** (FR-002 across all 13 Bezirke). No code change makes the combined selection available; it becomes available when the Bezirke finish their data entry. User Story 1 is the lever that helps, and that is another reason it is P1.
