# Feature Specification: Guided Raster Navigation

**Feature Branch**: `005-raster-guided-navigation`  
**Created**: 2026-07-14  
**Status**: Draft  
**Input**: User description: "Rework the Raster page into a guided left-navigation flow: Import data, Review data, Run optimizer, Review optimization runs. The source-to-input-set projection/merge review belongs in Review data and should normally be completed once after import or source refresh, not repeated for every optimizer run."

**Source**: `specs/003-raster-review-webapp/spec.md` → "Future UX Backlog", first bullet.

**Scope decision (2026-07-14)**: The guided flow is keyed on **scope + season**, where a scope is a Bezirk (e.g. Ostwestfalen/Lippe) or the Verband (WTTV, covering NRW-Liga / Verbandsliga). Planning all scopes together in one combined run is **out of scope here** and lives in `specs/006-combined-wttv-planning/`; this feature must not preclude it.

**Terminology**: "Scope" is the existing system's word for a level of the Germany → Verband → Bezirk tree. A Bezirk is a scope; the Verband (WTTV) is a scope. Where this spec says "a scope", read "a Bezirk or the Verband". The word is used because an input set may be keyed to either.

## Context: what an input set is today

An input set is the named bundle of wishes, gym capacities, and fixed upper-league Rasterzahlen that one optimizer run consumes (`specs/003-raster-review-webapp/spec.md`, Key Entities). It is currently keyed by a free-text `district` string plus a season. That string is not a scope reference: it is resolved by matching a `Scope` on `code` **or** `name`, at any level of the Germany → WTTV → Bezirk hierarchy. Raster sources, by contrast, already carry a real scope reference.

Two consequences shape this feature:

- Selecting the Verband as the target of an input set is already possible by accident — the scope hierarchy is seeded (`DE` → `WTTV` → 13 Bezirke) and the selector lists every scope the user can reach. It works, but nothing names it as a supported case or constrains which levels are sensible.
- An input set spanning multiple scopes cannot be expressed at all, because a single scope-shaped string cannot hold more than one scope. That limitation is left standing here; feature 006 addresses it. This feature's job is to introduce the scope reference (FR-020) without foreclosing a spanning variant later (FR-026).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Follow a named workflow for a chosen scope and season (Priority: P1)

An admin picks a scope — a Bezirk, or the Verband for the NRW-Liga/Verbandsliga leagues — and a season. Instead of a single scrolling page that mixes source uploads, gym capacities, group reviews, run buttons, and run comparisons, they see a left navigation with four named steps in the order the work actually happens: **Import data**, **Review data**, **Run optimizer**, **Review optimization runs**. Selecting a step shows only that step's work. The admin can tell at a glance which step they are on and what the next step is.

**Why this priority**: This is the core of the request and delivers value on its own. Naming the phases, keying them to an explicit scope, and separating them removes the main complaint — that everything is on one page with no indication of order, targeting a "district" that is really an unconstrained string.

**Independent Test**: Open Raster, select a Bezirk and a season, and verify four steps appear in a left navigation, each showing only its own content, with every capability from the old single page reachable from exactly one step. Repeat with the Verband scope selected and verify the same flow applies.

**Acceptance Scenarios**:

1. **Given** a scope and season with at least one input set, **When** the admin opens Raster, **Then** a left navigation shows the four steps in workflow order and one step is selected by default.
2. **Given** the admin is on any step, **When** they select a different step, **Then** the scope and season selection is preserved and only the chosen step's content is shown.
3. **Given** the admin selects the Verband scope rather than a Bezirk, **When** they work through the steps, **Then** the same four steps apply to the Verband-level leagues, and the scope is labelled as the Verband rather than as a district.
4. **Given** a user with view-only access to a scope, **When** they open Raster, **Then** they see the same four steps with the same content in read-only form, without edit or run controls.
5. **Given** the admin has selected a step, **When** they reload the page or share the address, **Then** the same step, scope, and season are restored.
6. **Given** a scope selector, **When** the admin opens it, **Then** each option shows its place in the hierarchy so a Bezirk is distinguishable from the Verband.

---

### User Story 2 - Review source-to-model matching once, in Review data (Priority: P2)

Today the projection/merge review between parsed sources and the input set model (club/team matching, per-team wish fields, group planning status, six-team mode) is rendered inside each input set's run area, so it reads as work to redo before every optimizer run. It moves into **Review data**, where it is completed once after an import or source refresh, and it stays settled until the underlying sources change.

**Why this priority**: This is the second half of the backlog item and the reason the flow feels repetitive. It depends on the step structure from User Story 1 existing first, but it is separately testable and separately valuable.

**Independent Test**: Import or refresh a source, complete the matching review in Review data, then go to Run optimizer and start a run. Verify the run flow does not ask for the same matching review again. Then refresh a source and verify Review data reports outstanding work.

**Acceptance Scenarios**:

1. **Given** an input set whose sources have been imported, **When** the admin opens Review data, **Then** the source-to-model matching review is presented there as the step's work.
2. **Given** the admin has completed the matching review, **When** they open Run optimizer, **Then** no source-to-model matching review is shown in the run step.
3. **Given** a completed matching review, **When** a source is refreshed, re-uploaded, or deleted, **Then** Review data indicates the review is outstanding again for the affected records.
4. **Given** a completed matching review and unchanged sources, **When** the admin starts several runs in a row, **Then** they are not asked to redo the matching review between runs.

---

### User Story 3 - See which steps are done and what blocks the next one (Priority: P3)

Each step in the left navigation shows its own readiness so the admin can see where the work stands without opening every step. When a step cannot be completed yet, the reason is stated in terms of the step that must be finished first.

**Why this priority**: This makes the guided flow genuinely guiding rather than just reorganized. The gates it surfaces already exist in the current behaviour; this exposes them in the navigation instead of only at the button that refuses to act.

**Independent Test**: Take an input set with missing gym capacities. Verify Run optimizer is shown as blocked with the reason pointing at Review data, and that resolving the capacities in Review data clears the indicator.

**Acceptance Scenarios**:

1. **Given** an input set with unresolved gym capacities, **When** the admin views the navigation, **Then** Run optimizer is marked as blocked and names the outstanding work.
2. **Given** an input set that has not passed validation, **When** the admin opens Run optimizer, **Then** the step states that validation must pass before a run can start.
3. **Given** all outstanding data work is resolved, **When** the admin views the navigation, **Then** Run optimizer is no longer marked blocked.
4. **Given** no runs have finished, **When** the admin views the navigation, **Then** Review optimization runs indicates there is nothing to review yet.

---

### Edge Cases

- The account has no Raster scopes configured, so no workflow can start.
- The user lacks access to the requested scope.
- The user has access to a Bezirk but not to the Verband, or vice versa.
- The scope and season have no input set yet, so Review data, Run optimizer, and Review optimization runs have nothing to act on.
- The scope and season have more than one input set (the current page renders each one with its own review and run controls).
- Existing input sets whose stored scope string matches a scope by name rather than by code, or matches no scope at all.
- Sources are refreshed while a matching review is partly complete.
- Sources are refreshed while a run is queued or already running.
- A run is queued or running when the admin navigates to another step.
- Gym capacities are edited after validation passed, invalidating the ready state.
- An input set has parsed wishes but no group model yet, or a group model with warnings.
- A user opens a step address directly for a step that has no content yet.

## Requirements *(mandatory)*

### Functional Requirements

#### Guided flow

- **FR-001**: The Raster area MUST present its work as four named steps in a persistent left navigation, ordered: Import data, Review data, Run optimizer, Review optimization runs.
- **FR-002**: Each step MUST show only the work belonging to that step, and every capability currently reachable on the Raster page MUST be reachable from exactly one step.
- **FR-003**: Scope and season selection MUST remain available and preserved across step changes.
- **FR-004**: The selected step MUST be addressable, so reloading or sharing the address restores the same step, scope, and season.
- **FR-005**: Import data MUST cover adding, refreshing, and removing source material, and creating an input set.
- **FR-006**: Review data MUST cover the source-to-input-set projection/merge review, including club/team matching, per-team wish fields, group planning status, six-team group mode, model warnings, gym capacity review, and fixed schedule numbers.
- **FR-007**: Run optimizer MUST cover validation, run settings, starting a run, and observing run progress, and MUST NOT present the source-to-model matching review.
- **FR-008**: Review optimization runs MUST cover finished run outcomes, generated snapshots, and run/scenario comparison.

#### Scope keying

- **FR-020**: An input set MUST be keyed to an explicit scope reference and a season, rather than to a free-text district value.
- **FR-021**: The system MUST support an input set whose scope is a Bezirk and an input set whose scope is the Verband, using the same flow for both.
- **FR-022**: The scope selector MUST show each option's position in the scope hierarchy, so a Bezirk is distinguishable from the Verband.
- **FR-023**: The scope selector MUST offer only scope levels on which an input set is meaningful, and MUST NOT present levels that cannot be planned.
- **FR-024**: Existing input sets MUST continue to resolve to their intended scope after the keying change, including those whose stored value matched a scope by name rather than by code.
- **FR-025**: Sources MUST continue to be consumable from the input set's own scope and its ancestor scopes.
- **FR-026**: The scope reference introduced by FR-020 MUST NOT foreclose a later input set that spans several scopes (feature 006). This feature does not build a spanning input set; it must leave one buildable.

#### Matching review

- **FR-009**: The system MUST record that the source-to-model matching review has been completed for an input set, so it is not presented as outstanding work again while its sources are unchanged.
- **FR-010**: When source material for an input set is refreshed, replaced, or removed, the system MUST mark the affected matching review as outstanding again.

#### Readiness

- **FR-011**: Each step MUST indicate its own readiness: not started, outstanding work, ready, or blocked.
- **FR-012**: When a step is blocked, the system MUST state the outstanding work and which earlier step resolves it.
- **FR-013**: Steps MUST remain reachable regardless of readiness, so a user can inspect a later step without first completing an earlier one. Readiness indicators inform; they do not lock navigation.
- **FR-014**: Existing gates MUST continue to hold regardless of navigation: a run cannot start before validation passes, and a run cannot start while gym capacity review is outstanding.

#### Access

- **FR-015**: Users with view-only scope access MUST see the same steps and content without edit, import, or run controls.
- **FR-016**: Users without access to a scope MUST NOT reach any step's content for that scope.

### Key Entities

- **Scope**: An existing hierarchy node — Germany → Verband (WTTV) → Bezirk. Already used to own raster sources. This feature makes it the key of an input set rather than a look-alike string.
- **Input set**: The named bundle of wishes, gym capacities, and fixed upper-league Rasterzahlen that one run consumes. Gains an explicit scope reference. Several may exist per scope and season as variants.
- **Workflow step**: One of the four named phases. Has a name, an order, an address, and a derived readiness state. Not user-created; the set of steps is fixed.
- **Matching review state**: Records, per input set, whether the source-to-model projection/merge review has been completed and against which source material, so a later source change can mark it outstanding again.
- **Step readiness**: Derived per step and per input set from existing data (sources present, review completed, validation passed, capacity review outstanding, runs finished). Not stored independently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin new to the tool can name the four steps and the order of the work within 10 seconds of opening Raster, without scrolling.
- **SC-002**: An admin can tell which step needs attention next without opening more than one step.
- **SC-003**: After completing the matching review once, an admin can start three consecutive runs without being presented the matching review again.
- **SC-004**: After a source refresh, the affected matching review is reported as outstanding before the next run can start.
- **SC-005**: Every capability available on the pre-redesign Raster page is reachable within two interactions from the step navigation, and none appears in more than one step.
- **SC-006**: When a run is blocked, the admin can identify the blocking work and reach the step that resolves it in one interaction.
- **SC-007**: No user reaches Raster content for a scope they cannot access.
- **SC-008**: An admin can tell whether they are planning a Bezirk or the Verband without opening a menu.
- **SC-009**: Every input set that existed before the keying change resolves to the same scope after it, with none orphaned.

## Assumptions

- The four step names in the backlog item are the intended user-facing names and are used as written.
- The redesign replaces the current single Raster page rather than being offered alongside it.
- Step navigation is free rather than sequential: readiness is advisory, and only the existing validation and capacity gates actually prevent an action. A wizard that locks later steps was not requested.
- The Verband case needs no new hierarchy: WTTV is already a seeded scope, so a Verband input set is one keyed to that scope. This feature names and constrains the case rather than inventing it.
- Planning at the Germany level is not a real case; the meaningful levels are Bezirk and Verband.
- The snapshot detail view remains a separate destination reached from Review optimization runs; it is not itself a step.
- No new review capability is introduced. Review data reorganizes reviews that already exist. The general fuzzy club/team matching improvement is a separate backlog item (`specs/003-raster-review-webapp/spec.md` "Future UX Backlog" second bullet, tasks T079-T082) and is out of scope here; this feature only fixes where that review lives and how often it is demanded.
- Recording matching review completion requires new persisted state; every other readiness signal is derived from data that already exists.
- View-only users see the same structure as admins, minus controls, consistent with the current page's role handling.
- Existing scope access rules, roles, and audit behaviour carry over unchanged.
- The step layout is expected to work on the same range of screens the rest of the application supports; a narrow-screen presentation of the left navigation is a design detail, not a scope question.

## Out of Scope

- Fuzzy club/team match scoring, confidence display, and persisted aliases (separate backlog item, tasks T079-T082).
- Any change to solver behaviour, run settings semantics, or snapshot contents.
- Any change to the import parsers or source formats.
- Planning several scopes together in one run, and any input set spanning more than one scope — see `specs/006-combined-wttv-planning/`. FR-026 keeps that possible; this feature does not build it.
- Translation of the Raster area into German or any other locale.

## Open Questions

- **Q1 (resolved 2026-07-14)**: The flow is keyed on scope + season, covering Bezirk and Verband alike. A separate combined selection for all scopes at once was split out to feature 006.
- **Q2 (resolved 2026-07-14)**: Inputs are complete when groups and teams are known, every team has a wish with game day, gym, and start time, and every implied gym capacity is stored and not lower than required. A missing game week A/B preference is a legitimate value and does not block. This answer now governs feature 006's completeness gate; it has no effect on this feature.
- **Q3 (resolved 2026-07-14)**: Combined all-WTTV planning is split into feature `006-combined-wttv-planning`. Rationale: `specs/003-raster-review-webapp/spec.md` already scoped the first release to district scale and deferred county-wide scale (~1,400 clubs/teams); solver feasibility at Verband scale is unestablished; the gate depends on all 13 Bezirke completing their data; and this feature already carries one risky migration (FR-024). Stories here deliver without it. FR-026 carries the only obligation that remains.
