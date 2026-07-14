# Specification Quality Checklist: Guided Raster Navigation

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-14  
**Updated**: 2026-07-14 (clarify session: 5 questions asked and answered)  
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

**Status: ready for `/speckit.plan`.** Q4 (marking partial-run snapshots) is deliberately deferred to planning; it does not block the stories here.

## Notes

### What the clarify session changed

- **Group exclusion is the real workflow, and the spec had missed it.** A season is planned as one input set per scope; where wishes have not arrived, the admin excludes those groups and runs the rest. `planningStatus: include | exclude` already exists in the season model. This makes Review data's central lever a thing that already exists (FR-006b-g).
- **Exclusion is a stopgap, not a resolution.** Corrected after an initial over-correction: the first pass had exclusion "equal in standing to supplying the wishes" and excluded groups counting as no outstanding work anywhere. Both were wrong. A plan is only really useful when it covers the whole Bezirk, so exclusion defers a group rather than settling it (FR-006c), excluded groups stay visible as deferred work (FR-006e), readiness must distinguish "ready with everything included" from "ready because things are excluded" (FR-011a), and the arrival of missing wishes must resurface the exclusion (FR-006f). The failure mode this prevents: a nav showing Review data ✓ done while three groups sit excluded.
- **No input-set selector.** Parallel input sets are not how variants are handled, so the "1 of 3 ready" rollup problem disappears (FR-006a).
- **The migration is gone.** There is no production Raster data, so nothing is migrated — existing rows are discarded and reimported (FR-024). This removed what had been the riskiest requirement in the spec.
- **Per-record review invalidation** (FR-009, FR-010, FR-010a-b): only records whose parsed data actually changed become outstanding. A whole-input-set flag would have re-opened the review for an entire Bezirk every time one club's PDF was re-uploaded — the exact repetition this feature exists to remove.
- **"District" is a mistranslation and is being retired** (FR-022a). The field has held `WTTV` all along; the label never matched the data.

### Live risks

- **FR-024 rests entirely on "no production data".** If a real deployment exists by build time, revisit it: gym capacities marked `REVIEWED` and review decisions with notes carry human work that no reimport restores. Everything else (sources, wishes, groups, runs, snapshots) is reimportable.
- **FR-010 needs real change detection.** "Only records whose parsed data actually changed" means comparing a re-parse against what was reviewed, not just noticing that a source was touched. FR-010a (an identical re-parse changes nothing) is the test that keeps this honest.
- **FR-026 remains a constraint on FR-020's design.** Feature 006 needs a scope-spanning input set; the scope reference chosen here must leave that buildable.

### Cross-spec check — 006 is correct as written (earlier claim retracted)

An earlier note here claimed 006's completeness gate (FR-002b, every team has a matched wish) had to be relaxed to count only *included* groups, on the theory that excluded groups would keep a scope permanently incomplete. That was wrong and is withdrawn.

Exclusion is provisional: wishes eventually arrive, the groups are included, and the Bezirk is run whole. So a scope with excluded groups genuinely *is* incomplete, and 006 waiting for it is correct — it matches the stated precondition that combined planning "only works if all inputs are already filled for all clubs/teams for the whole WTTV". Relaxing the gate would have let a combined run start on data the admin considers unfinished, which is the exact failure 006's gate exists to prevent. **No change needed in 006.**

### Unchanged boundaries

- Fuzzy club/team matching (T079-T082) stays out: this spec relocates the matching review and reduces how often it is demanded; it does not change how matches are computed or displayed.
