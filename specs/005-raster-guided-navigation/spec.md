# Feature Specification: Guided Raster Navigation

**Feature Branch**: `005-raster-guided-navigation`  
**Created**: 2026-07-14  
**Status**: Draft  
**Input**: User description: "Rework the Raster page into a guided left-navigation flow: Import data, Review data, Run optimizer, Review optimization runs. The source-to-input-set projection/merge review belongs in Review data and should normally be completed once after import or source refresh, not repeated for every optimizer run."

**Source**: `specs/003-raster-review-webapp/spec.md` → "Future UX Backlog", first bullet.

**Scope decision (2026-07-14)**: The guided flow is keyed on **scope + season**, where a scope is a Bezirk (e.g. Ostwestfalen/Lippe) or the Verband (WTTV, covering NRW-Liga / Verbandsliga). Planning all scopes together in one combined run is **out of scope here** and lives in `specs/006-combined-wttv-planning/`; this feature must not preclude it.

**Terminology**: "Scope" is the existing system's word for a level of the Germany → Verband → Bezirk tree. A Bezirk is a scope; the Verband (WTTV) is a scope. Where this spec says "a scope", read "a Bezirk or the Verband". The word is used because an input set may be keyed to either.

## Clarifications

### Session 2026-07-14

- Q: How does the guided flow handle several input sets in one scope and season? → A: One input set per scope and season is the working norm; there is no input-set selector. Running variants as parallel input sets is not the workflow. Where wishes have not yet arrived, the admin excludes the affected groups from planning inside that single input set and runs the rest.
- Q: Is excluding a group a resolution or a stopgap? → A: A stopgap. Exclusion is provisional: when the remaining wishes arrive, the admin includes those groups and runs the whole Bezirk. A run only really works when it covers the whole Bezirk, so a partial run is a working step, not the season's result. An excluded group is deferred work, not settled work, and must never read as done.
- Q: When a source is refreshed, how much of the matching review has to be redone? → A: Per record. Only the clubs/teams whose parsed data actually changed become outstanding again; every other record stays settled. Re-parsing a source that yields identical data leaves the review untouched.
- Q: During the scope-keying change, what happens to input sets whose stored district value matches no scope? → A: Nothing is migrated. There is no production Raster data — only dev and seeded data — so every existing Raster row is discarded and the data is reimported from its sources. This applies to gym capacities and review decisions too, which are not reimportable but hold no real work at this stage.
- Q: Which step is selected when opening Raster for a scope and season? → A: The first step with outstanding work, falling through to Review optimization runs when nothing is outstanding. Not a remembered per-user step, and not always Import data.
- Q: What should the UI call the scope levels? → A: The German domain terms "Bezirk" and "Verband", used as proper names in every locale. Not "District"/"Association". The existing "District" label is a mistranslation and is replaced.

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

1. **Given** a scope and season with at least one input set, **When** the admin opens Raster without naming a step, **Then** a left navigation shows the four steps in workflow order and the first step with outstanding work is selected.
7. **Given** a scope and season where no step has outstanding work, **When** the admin opens Raster without naming a step, **Then** Review optimization runs is selected.
2. **Given** the admin is on any step, **When** they select a different step, **Then** the scope and season selection is preserved and only the chosen step's content is shown.
3. **Given** the admin selects the Verband scope rather than a Bezirk, **When** they work through the steps, **Then** the same four steps apply to the Verband-level leagues, and the scope is labelled "Verband" rather than "District".
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
3. **Given** a completed matching review, **When** one club's wish PDF is re-uploaded with changed data, **Then** only that club's affected records become outstanding and every other club stays settled.
5. **Given** a completed matching review, **When** a source is re-parsed and yields identical data, **Then** no record becomes outstanding.
4. **Given** a completed matching review and unchanged sources, **When** the admin starts several runs in a row, **Then** they are not asked to redo the matching review between runs.

---

### User Story 3 - See which steps are done and what blocks the next one (Priority: P3)

Each step in the left navigation shows its own readiness so the admin can see where the work stands without opening every step. When a step cannot be completed yet, the reason is stated in terms of the step that must be finished first.

**Why this priority**: This makes the guided flow genuinely guiding rather than just reorganized. The gates it surfaces already exist in the current behaviour; this exposes them in the navigation instead of only at the button that refuses to act.

**Independent Test**: Take an input set with missing gym capacities. Verify Run optimizer is shown as blocked with the reason pointing at Review data, and that resolving the capacities in Review data clears the indicator. Separately, take an input set with a group whose wishes are missing, exclude that group, and verify the flow stops treating it as outstanding work.

**Acceptance Scenarios**:

1. **Given** an input set with unresolved gym capacities, **When** the admin views the navigation, **Then** Run optimizer is marked as blocked and names the outstanding work.
2. **Given** an input set that has not passed validation, **When** the admin opens Run optimizer, **Then** the step states that validation must pass before a run can start.
3. **Given** all outstanding data work is resolved, **When** the admin views the navigation, **Then** Run optimizer is no longer marked blocked.
4. **Given** no runs have finished, **When** the admin views the navigation, **Then** Review optimization runs indicates there is nothing to review yet.
5. **Given** a group whose wishes have not arrived, **When** the admin excludes it in Review data, **Then** it no longer blocks a run, while remaining visible as deferred work for the season.
6. **Given** a season where some groups are excluded, **When** the admin views Review data, **Then** the excluded groups are visible as excluded rather than hidden.
7. **Given** a season where some groups are excluded, **When** the admin views the navigation, **Then** no step is shown as unqualified ready and the scope is not shown as fully planned.
8. **Given** an excluded group, **When** its wishes arrive, **Then** the system surfaces that the group can now be included.
9. **Given** every group is included, **When** the admin views the navigation, **Then** readiness reflects a complete Bezirk rather than a partial one.

---

### Edge Cases

- The account has no Raster scopes configured, so no workflow can start.
- The user lacks access to the requested scope.
- The user has access to a Bezirk but not to the Verband, or vice versa.
- The scope and season have no input set yet, so Review data, Run optimizer, and Review optimization runs have nothing to act on.
- A scope and season somehow end up with more than one input set, so the flow must still resolve to a single working subject.
- Every group in a scope is excluded, leaving nothing to plan.
- A group is excluded after a run has already been started or finished with it included.
- A group's wishes arrive after it was excluded, so the exclusion is no longer necessary.
- A snapshot from a partial run is compared with, or mistaken for, one covering the whole Bezirk.
- Every group's wishes finally arrive, and the admin needs to find every excluded group to include them.
- A scope's sources are no longer available to reimport after existing data is discarded, so the scope starts empty.
- Sources are refreshed while a matching review is partly complete.
- A source refresh changes a record that was already reviewed, versus one that was never reviewed.
- A source is deleted, leaving reviewed records with no source material behind them.
- A refresh changes which club a team matches to, invalidating a match the admin had confirmed by hand.
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
- **FR-004a**: When no step is specified, the system MUST open the first step in workflow order that has outstanding work, and MUST open Review optimization runs when no step has outstanding work.
- **FR-004b**: The default step MUST be derived from current readiness rather than from a remembered per-user preference.
- **FR-005**: Import data MUST cover adding, refreshing, and removing source material, and creating an input set.
- **FR-006**: Review data MUST cover the source-to-input-set projection/merge review, including club/team matching, per-team wish fields, group planning status, six-team group mode, model warnings, gym capacity review, and fixed schedule numbers.
- **FR-006a**: The guided flow MUST act on a single input set per scope and season. It MUST NOT require the user to choose between parallel input sets, and MUST NOT present an input-set selector as part of the normal flow.
- **FR-006b**: Review data MUST let an admin exclude a group from planning and include it again, and MUST make the excluded/included state of every group visible.
- **FR-006c**: Excluding a group MUST be presented as a way to proceed while its wishes are outstanding, not as a resolution to them. It is a routine and legitimate step, but it defers the group rather than settling it.
- **FR-006d**: A group excluded from planning MUST NOT block validation or a run. Its teams MUST NOT appear as gaps blocking the current run.
- **FR-006e**: An excluded group MUST remain visible as deferred work for the season. The system MUST NOT present a scope as fully planned, or Review data as having no outstanding work, while any group is excluded.
- **FR-006f**: When wishes arrive for an excluded group, the system MUST surface that the group can now be included, rather than leaving the exclusion silently in place.
- **FR-006g**: The flow MUST treat a run covering every group as the goal, and a run with groups excluded as provisional. A partial run is a step towards the season's plan, not the plan.
- **FR-007**: Run optimizer MUST cover validation, run settings, starting a run, and observing run progress, and MUST NOT present the source-to-model matching review.
- **FR-008**: Review optimization runs MUST cover finished run outcomes, generated snapshots, and run/scenario comparison.

#### Scope keying

- **FR-020**: An input set MUST be keyed to an explicit scope reference and a season, rather than to a free-text district value.
- **FR-021**: The system MUST support an input set whose scope is a Bezirk and an input set whose scope is the Verband, using the same flow for both.
- **FR-022**: The scope selector MUST show each option's position in the scope hierarchy, so a Bezirk is distinguishable from the Verband.
- **FR-022a**: The UI MUST name the scope levels "Bezirk" and "Verband". It MUST NOT label a scope "District" or "Association". These are proper names of organisational levels and are used as-is in every locale.
- **FR-023**: The scope selector MUST offer only scope levels on which an input set is meaningful, and MUST NOT present levels that cannot be planned.
- **FR-024**: Existing Raster data MUST NOT be migrated to the new scope keying. There is no production Raster data, so existing rows are discarded and the data reimported from its sources. This feature MUST NOT carry a migration path for the free-text district value.
- **FR-025**: Sources MUST continue to be consumable from the input set's own scope and its ancestor scopes.
- **FR-026**: The scope reference introduced by FR-020 MUST NOT foreclose a later input set that spans several scopes (feature 006). This feature does not build a spanning input set; it must leave one buildable.

#### Matching review

- **FR-009**: The system MUST record, per reviewed record (club/team), that its source-to-model match has been reviewed, and against which source material, so it is not presented as outstanding work again while that material is unchanged.
- **FR-010**: When source material for an input set is refreshed, replaced, or removed, the system MUST mark as outstanding only those records whose parsed data actually changed. Records unaffected by the change MUST stay settled.
- **FR-010a**: Re-parsing or refreshing a source that yields data identical to what a record was reviewed against MUST NOT make that record outstanding again.
- **FR-010b**: Where any record is outstanding, Review data MUST make clear which records they are, so the admin re-reviews only those rather than the whole set.

#### Readiness

- **FR-011**: Each step MUST indicate its own readiness: not started, outstanding work, ready, or blocked.
- **FR-011a**: Readiness MUST distinguish "ready with every group included" from "ready because groups are excluded". The second MUST NOT be shown as an unqualified ready state.
- **FR-012**: When a step is blocked, the system MUST state the outstanding work and which earlier step resolves it.
- **FR-012a**: Where outstanding work is a group's missing wishes, the stated options MUST include excluding that group to proceed for now, alongside supplying the missing data.
- **FR-013**: Steps MUST remain reachable regardless of readiness, so a user can inspect a later step without first completing an earlier one. Readiness indicators inform; they do not lock navigation.
- **FR-014**: Existing gates MUST continue to hold regardless of navigation: a run cannot start before validation passes, and a run cannot start while gym capacity review is outstanding.

#### Access

- **FR-015**: Users with view-only scope access MUST see the same steps and content without edit, import, or run controls.
- **FR-016**: Users without access to a scope MUST NOT reach any step's content for that scope.

### Key Entities

- **Scope**: An existing hierarchy node — Germany → Verband (WTTV) → Bezirk. Already used to own raster sources. This feature makes it the key of an input set rather than a look-alike string.
- **Input set**: The named bundle of wishes, gym capacities, and fixed upper-league Rasterzahlen that one run consumes. Gains an explicit scope reference. One per scope and season is the working norm; the model permits more, but the flow does not treat them as parallel variants to choose between.
- **Group planning status**: Per group, whether it is included in or excluded from planning. Already exists in the season model. This feature promotes it to the main lever of Review data, because excluding groups whose wishes have not arrived is how work continues while a season's data is incomplete. Exclusion is provisional by nature: the season's goal is every group included and one run covering the whole Bezirk.
- **Workflow step**: One of the four named phases. Has a name, an order, an address, and a derived readiness state. Not user-created; the set of steps is fixed.
- **Matching review state**: Per reviewed record (club/team), whether its source-to-model match has been reviewed and against which source material, so a later source change can mark exactly the changed records outstanding while the rest stay settled. This is the feature's one piece of new persisted state, and per-record granularity is what makes FR-010 possible.
- **Step readiness**: Derived per step and per input set from existing data (sources present, review completed, validation passed, capacity review outstanding, runs finished). Not stored independently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin new to the tool can name the four steps and the order of the work within 10 seconds of opening Raster, without scrolling.
- **SC-002**: An admin can tell which step needs attention next without opening more than one step.
- **SC-003**: After completing the matching review once, an admin can start three consecutive runs without being presented the matching review again.
- **SC-004**: After one club's source is refreshed with changed data, that club's records are reported as outstanding before the next run can start, and no unaffected club's records are.
- **SC-005**: Every capability available on the pre-redesign Raster page is reachable within two interactions from the step navigation, and none appears in more than one step.
- **SC-006**: When a run is blocked, the admin can identify the blocking work and reach the step that resolves it in one interaction.
- **SC-007**: No user reaches Raster content for a scope they cannot access.
- **SC-008**: An admin can tell whether they are planning a Bezirk or the Verband without opening a menu, and the level is named as such.
- **SC-012**: An admin opening Raster lands on the step needing attention without navigating, or on Review optimization runs when nothing is outstanding.
- **SC-009**: After the keying change, an admin can reimport a scope's sources and reach a started run without any manual data repair.
- **SC-010**: An admin whose wishes are incomplete for some groups can still reach a started run, by excluding those groups, without leaving the guided flow.
- **SC-011**: An admin can see which groups are excluded from planning for a season without opening any group.
- **SC-013**: An admin can never mistake a Bezirk with excluded groups for a fully planned one.
- **SC-014**: When the last outstanding wishes arrive, an admin can include the affected groups and reach a whole-Bezirk run without hunting for which groups were excluded.

## Assumptions

- The four step names in the backlog item are the intended user-facing names and are used as written.
- The redesign replaces the current single Raster page rather than being offered alongside it.
- Step navigation is free rather than sequential: readiness is advisory, and only the existing validation and capacity gates actually prevent an action. A wizard that locks later steps was not requested.
- The Verband case needs no new hierarchy: WTTV is already a seeded scope, so a Verband input set is one keyed to that scope. This feature names and constrains the case rather than inventing it.
- Planning at the Germany level is not a real case; the meaningful levels are Bezirk and Verband.
- The snapshot detail view remains a separate destination reached from Review optimization runs; it is not itself a step.
- No new review capability is introduced. Review data reorganizes reviews that already exist. The general fuzzy club/team matching improvement is a separate backlog item (`specs/003-raster-review-webapp/spec.md` "Future UX Backlog" second bullet, tasks T079-T082) and is out of scope here; this feature only fixes where that review lives and how often it is demanded.
- Recording matching review completion requires new persisted state; every other readiness signal is derived from data that already exists.
- Group planning status already exists in the season model and already persists; this feature changes where and how prominently it is presented, not what it is.
- A Rasterzahl plan is only really useful when it covers the whole Bezirk. Runs with groups excluded are working steps taken while waiting for wishes, not the season's result. The flow is therefore built to drive towards full inclusion rather than to make exclusion comfortable.
- Whether a snapshot produced from a partial run should itself be marked as partial is left to planning (see Open Questions Q4). This feature does not otherwise change snapshot contents.
- A season is normally planned once per scope as a single input set. The data model permits several, but the flow is not built around choosing between them.
- There is no production Raster data at the time this feature is built — only dev and seeded data — so nothing needs migrating and existing rows can be discarded. This assumption is load-bearing: FR-024 depends on it entirely. If a real deployment exists by then, FR-024 must be revisited, because gym capacities marked REVIEWED and review decisions carry human work that no reimport restores.
- View-only users see the same structure as admins, minus controls, consistent with the current page's role handling.
- Existing scope access rules, roles, and audit behaviour carry over unchanged.
- The step layout is expected to work on the same range of screens the rest of the application supports; a narrow-screen presentation of the left navigation is a design detail, not a scope question.

## Out of Scope

- Fuzzy club/team match scoring, confidence display, and persisted aliases (separate backlog item, tasks T079-T082).
- Any change to solver behaviour, run settings semantics, or snapshot contents.
- Any change to the import parsers or source formats.
- Planning several scopes together in one run, and any input set spanning more than one scope — see `specs/006-combined-wttv-planning/`. FR-026 keeps that possible; this feature does not build it.
- Translation of the Raster area into German or any other locale. FR-022a is not a translation decision: "Bezirk" and "Verband" are proper names carried in every locale, the way the scope names already are.

## Open Questions

- **Q1 (resolved 2026-07-14)**: The flow is keyed on scope + season, covering Bezirk and Verband alike. A separate combined selection for all scopes at once was split out to feature 006.
- **Q2 (resolved 2026-07-14)**: Inputs are complete when groups and teams are known, every team has a wish with game day, gym, and start time, and every implied gym capacity is stored and not lower than required. A missing game week A/B preference is a legitimate value and does not block. This answer now governs feature 006's completeness gate; it has no effect on this feature.
- **Q4 (open, decide at planning)**: Should a snapshot produced from a run with groups excluded be marked as partial, so it cannot be mistaken for a whole-Bezirk plan? FR-006g and SC-013 cover the flow's own presentation, but a snapshot outlives the flow and is reachable from run comparison. Marking it would touch snapshot contents, which this feature otherwise leaves alone — hence deferred rather than assumed.
- **Q3 (resolved 2026-07-14)**: Combined all-WTTV planning is split into feature `006-combined-wttv-planning`. Rationale: `specs/003-raster-review-webapp/spec.md` already scoped the first release to district scale and deferred county-wide scale (~1,400 clubs/teams); solver feasibility at Verband scale is unestablished; the gate depends on all 13 Bezirke completing their data; and this feature already carries one risky migration (FR-024). Stories here deliver without it. FR-026 carries the only obligation that remains.
