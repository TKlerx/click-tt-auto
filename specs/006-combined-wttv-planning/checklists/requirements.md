# Specification Quality Checklist: Combined WTTV Planning

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-14  
**Updated**: 2026-07-14 (clarify session — feature reshaped from a gated all-WTTV run to a subset run with persisted incompleteness)  
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

**Status: ready for `/speckit.plan`.** Q2 and Q4 are planning decisions, not specification gaps. Q1 is no longer a blocker.

## Notes

### The clarify session inverted this feature

The original spec was built on the opening framing: combined planning "only works if all inputs are already filled for all clubs/teams for the whole wttv". Everything followed from that — an all-or-nothing scope selection, a hard completeness gate, an organisational blocker, and a P1 readiness overview whose job was to gatekeep.

That framing did not survive contact with how the tool is used. Groups are excluded not only to wait for wishes but **to exercise the optimizer with deliberately incomplete constraints and see what it does**. The same intent applies to combined runs: two Bezirke with gaps, run today, is the near-term value.

So completeness became a **recorded property of the run** rather than a precondition for it. Consequences:

- **The organisational blocker is gone.** It was the strongest of the three arguments for splitting 006 out of 005 and deferring it. The split still holds on the other two — a scope-spanning data model, and unproven solver behaviour — but "unusable until 13 Bezirke finish" no longer applies. This feature is buildable now.
- **Q1 stopped being a risk and became a measurement.** It previously demanded a spike before the combined run could be planned at all. With subset runs, the solver's practical limit is discovered by adding Bezirke until runs stop completing acceptably (SC-008). If the full ~1,400-team problem proves intractable, the feature still delivers everything short of it.
- **Priorities inverted.** The readiness overview fell P1 → P3: it was the gatekeeper, now it is a planning aid. The combined run rose P2 → P1.

### The coverage record is doing the safety work

Allowing incomplete runs is only safe because they are *known* to be incomplete — which is why User Story 2 is also P1 and ships alongside User Story 1. A subset run with gaps that looks like a finished plan is worse than having no subset runs at all.

Two properties are easy to lose and worth defending in review:

- **FR-038: written at start, never revised.** Recomputing the record later would make an old snapshot retroactively flattering — filling the gaps would silently rewrite history to claim the run saw them. It did not.
- **FR-035: it applies to single-scope runs too.** A Bezirk run with excluded groups is incomplete by the same rule. Scoping the marker to combined runs only would leave 005's partial runs unmarked, which is the exact hazard this mechanism exists to close.

### This settles feature 005's Q4

005 asked whether a partial run's snapshot should be marked as partial, and declined it — arguing (research R-008) that it was "the same hazard feature 006 must solve for combined snapshots, and solving it once, coherently, across both beats bolting a flag onto this feature".

FR-030 to FR-038 are that solution, and FR-035 explicitly covers 005's case. **005's research.md R-008 should be updated to point here** once this lands: it currently records the question as declined with residual risk, which stops being true.

### What `/speckit.analyze` caught

**FR-021 vanished in the reshape and was restored.** It requires combined snapshots to be distinguishable from single-scope ones *in lists*. The rewrite replaced it with FR-036 — which marks **incomplete** runs, a different property. The result was that a *complete* combined snapshot spanning the whole Verband would have sat in a list looking exactly like a Bezirk plan.

This is the characteristic failure of a mid-session reshape: a requirement gets replaced by something that sounds like it and isn't. Two independent markers are needed — incomplete answers "can this be trusted?", combined answers "what is this a plan of?" — and collapsing them loses the fully-valid WTTV-wide plan.

Restoring the original number also repaired dangling references: feature 005's Q4 and research R-008 both cite "006's FR-020/FR-021" as the mechanism that settles 005's Q4.

### Live risks

- **FR-034's negative case is the fragile one.** A run spanning every scope with no gaps is the only run *not* marked incomplete. It is also the rarest, so the logic deciding "nothing was missing" is the least-exercised path and the most consequential to get wrong — a falsely-complete marking is worse than no marking at all.
- **FR-012 removes a refusal.** The system will now start runs it previously would have blocked. FR-012a (show what is missing before starting) is what keeps that a choice rather than an accident.
- **Q4 (retrofitting the record onto existing runs)** contradicts FR-038 if answered naively — you cannot honestly record what an old run saw. No production data exists, so the cheap answer is to verify none survives rather than to invent records for it.

### Deferred deliberately

- **Q2** — wall-clock limit for a combined run. Depends on Q1's evidence.
- **Q3** — which snapshot wins when combined and single-scope disagree. Operational convention; the coverage record at least makes the incomplete one identifiable, which is the part that would hurt.
- **The WTTV-wide scheduler** (007's FR-014). Not needed here: FR-015 only requires that a user cannot include scopes they cannot access, so a Bezirk admin can combine the Bezirke they already hold.
