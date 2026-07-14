# Specification Quality Checklist: Guided Raster Navigation

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-14  
**Updated**: 2026-07-14 (Q1 resolved: scope + season keying. Q2 resolved: completeness gate defined, now owned by feature 006. Q3 resolved: combined planning split to feature 006.)  
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

**Status: ready for `/speckit.plan`.** All three open questions are resolved.

## Notes

- **Q1 resolved**: the flow is keyed on scope + season. Bezirk and Verband are the same case at different hierarchy levels, so Verband support (FR-021) costs a selector constraint and a rename, not a new model — `WTTV` is already a seeded scope.
- **Q3 resolved**: combined all-WTTV planning split to feature `006-combined-wttv-planning`. It was the only part needing a scope-spanning model, the only part with no counterpart in the current page, and it is unusable until every Bezirk completes its data. `specs/003-raster-review-webapp/spec.md` had already deferred county-wide scale. FR-026 is all that remains here: do not foreclose the spanning variant.
- **Q2 resolved but now belongs to 006**: the completeness gate (groups/teams known, wish with game day + gym + start time, gym capacity stored and not below requirement, A/B absence acceptable) was settled here and carried into 006's spec. Two findings drove it and are worth not re-deriving:
  - There is no reviewed/confirmed flag on a gym capacity. The review is recomputed each time from stored capacity versus what the wishes imply, so "present but not reviewed" is not a state that exists.
  - Game week A/B is not part of the existing wish-completeness check, and a genuinely absent A/B preference is a real answer rather than a gap.
- **One data-model change remains**: FR-020, keying the input set to a scope reference rather than a free-text string, with FR-024 migration. Everything else is a rearrangement of existing capability plus FR-009's review-completion state.
- **FR-024 is the riskiest requirement here**: the current value is matched against scope `code` *or* `name`, so stored values may be either form, or neither. Planning should establish what values actually exist before choosing the migration.
- **FR-026 is a constraint on FR-020's design**, not a deliverable. Feature 006 needs a spanning input set; the scope reference chosen here must leave that buildable.
- Boundary with the sibling backlog item (fuzzy matching, T079-T082) is drawn deliberately: this spec relocates the matching review and reduces how often it is demanded; it does not change how matches are computed or displayed.
