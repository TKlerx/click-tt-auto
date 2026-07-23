# Feature Specification: Manual Baseline Rasterzahlen Import

**Feature Branch**: `012-manual-baseline-raster`  
**Created**: 2026-07-23  
**Status**: Draft  
**Input**: User description: "Crawl/scrape the current manually set Rasterzahlen from click-TT as the manual baseline Rasterzahlen. They are hidden/tricky to get, should use the authenticated Playwright scraper path again, and should be stored as an optional manual baseline."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import Current Manual Baseline (Priority: P1)

A scheduler imports the current expert-set Rasterzahlen from click-TT for the selected scope, season, and planning workspace, so the existing manual plan can be preserved and compared without hand-copying hidden values.

**Why this priority**: This captures the real current planning state. Without it, the optimizer can only compare against wishes and generated assignments, not the baseline that planners actually know.

**Independent Test**: Can be fully tested with captured click-TT pages or a test account by running a baseline import for one scope/season and verifying the imported rows match the current click-TT Rasterzahlen.

**Acceptance Scenarios**:

1. **Given** a scheduler is on a raster workspace with click-TT access configured, **When** they start manual baseline import, **Then** the system collects current Rasterzahlen for all available groups in that scope and season through the authenticated live click-TT browser flow.
2. **Given** a click-TT group hides the current Rasterzahl behind a nested or non-obvious page/action, **When** the import runs, **Then** the value is still captured with its source group, source team label, source URL, and import timestamp.
3. **Given** a baseline import already exists for the workspace, **When** the scheduler refreshes it, **Then** the new imported baseline becomes the active baseline while the UI makes clear that previous optimizer runs used their original captured baseline.

---

### User Story 2 - Review Baseline Mappings (Priority: P1)

A scheduler reviews imported baseline rows that cannot be safely mapped to the season model, fixes or ignores them, and only then treats the baseline as usable for comparison.

**Why this priority**: Hidden click-TT labels may differ from the season model. Silent mismatches would make baseline comparison misleading.

**Independent Test**: Can be tested by importing fixture rows with exact, ambiguous, unmatched, renamed, and duplicate team labels, then verifying the review area blocks "ready" status until each unresolved row is mapped or ignored.

**Acceptance Scenarios**:

1. **Given** imported baseline rows include a team that matches the season model exactly, **When** the review page is opened, **Then** the row is shown as settled without requiring manual action.
2. **Given** imported baseline rows include ambiguous or unmatched team labels, **When** the review page is opened, **Then** those rows are highlighted in one review area where the scheduler can map, ignore, or correct them.
3. **Given** a scheduler manually maps a baseline row, **When** the baseline import is refreshed, **Then** the existing manual decision is preserved unless the source row changed in a way that requires review again.

---

### User Story 3 - Use Baseline as Optional Comparison (Priority: P2)

A scheduler starts optimization with or without the manual baseline and sees result deltas against the baseline when it was selected.

**Why this priority**: The baseline should help explain optimizer changes, but it must not become a hidden hard constraint.

**Independent Test**: Can be tested by running the optimizer once with a reviewed baseline selected and once without it, then verifying only the baseline-selected run records and displays baseline comparison.

**Acceptance Scenarios**:

1. **Given** a reviewed manual baseline exists, **When** the scheduler starts an optimizer run and selects the baseline as comparison input, **Then** the run snapshot records which baseline was used.
2. **Given** a run used a baseline, **When** the scheduler opens results, **Then** they can see unchanged, changed, missing-from-baseline, and new assignment counts and details.
3. **Given** a baseline contains a Rasterzahl that differs from optimizer output, **When** the result is shown, **Then** the difference is reported as a comparison delta, not as a constraint violation.

---

### User Story 4 - Keep Read-Only Viewing Safe (Priority: P3)

A read-only user can inspect already imported baseline information where their access allows it, without triggering click-TT crawling or writes.

**Why this priority**: Access behavior must stay consistent with FR-016 scheduler-only writes and avoid another write-on-read path.

**Independent Test**: Can be tested by loading the baseline/review pages as a read-only scope user and verifying no import, refresh, mapping, or mutation occurs.

**Acceptance Scenarios**:

1. **Given** a SCOPE_USER opens raster review pages, **When** a manual baseline exists, **Then** they can view allowed baseline status without seeing write actions.
2. **Given** a SCOPE_USER opens pages before any baseline exists, **When** the page renders, **Then** no click-TT crawl or baseline row creation occurs.

### Edge Cases

- click-TT exposes no current Rasterzahl for a group or team that exists in the season model.
- A saved click-TT URL contains stateful navigation parameters and would return the wrong group if replayed directly.
- click-TT exposes current Rasterzahlen for teams outside the selected scope, season, or workspace.
- Multiple click-TT rows normalize to the same team or club label.
- A source team has been renamed, moved groups, withdrawn, or replaced since the season model was imported.
- A Rasterzahl is outside the valid range for the group's schedule size.
- A click-TT page layout or navigation path changes and the crawler can only import a subset.
- A refresh happens while another baseline import is still running.
- Imported baseline values conflict with fixed upper-league or manually fixed schedule-number entries.
- The scheduler wants to use optimizer results without importing or selecting a baseline.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let schedulers create or refresh a manual baseline Rasterzahl import for the selected scope, season, and planning workspace.
- **FR-002**: The system MUST collect the manual baseline Rasterzahlen through the existing authenticated Playwright click-TT scraper flow, not by replaying saved stateful admin URLs.
- **FR-003**: The system MUST collect current expert-set Rasterzahlen from click-TT even when the values are only reachable through nested, indirect, or hidden group/team pages.
- **FR-004**: Each imported baseline row MUST preserve the source scope/season context, click-TT group label, click-TT team label, Rasterzahl, source location, and import timestamp.
- **FR-005**: The system MUST verify that each captured baseline row belongs to the intended click-TT group/team context before storing it.
- **FR-006**: The system MUST store the manual baseline as optional comparison data, not as a hard optimizer constraint by default.
- **FR-007**: The system MUST keep manual baseline data separate from wish imports, capacity imports, upper-league fixed imports, and optimizer output.
- **FR-008**: The system MUST show all unmatched, ambiguous, invalid, or changed baseline rows in one review area where schedulers can map, ignore, or correct them.
- **FR-009**: The system MUST preserve scheduler review decisions across baseline refreshes when the underlying source row still represents the same team.
- **FR-010**: The system MUST mark a baseline as ready only when every imported row is either mapped, ignored, or explicitly accepted as unresolved.
- **FR-011**: The optimizer run setup MUST let schedulers choose whether to attach the reviewed baseline as comparison input.
- **FR-012**: Optimizer run snapshots MUST record whether a baseline was used and which baseline version was used.
- **FR-013**: Result pages for runs with a baseline MUST show assignment deltas against that baseline, including unchanged assignments, changed Rasterzahlen, assignments missing from the baseline, and baseline rows missing from optimizer output.
- **FR-014**: Baseline deltas MUST NOT be reported as hard-constraint violations unless a value was separately marked fixed through an existing fixed-assignment workflow.
- **FR-015**: Import failures MUST report which scope, group, or navigation step failed and MUST keep the previous active baseline usable when one exists.
- **FR-016**: Read-only scope users MUST NOT be able to trigger baseline imports, refreshes, mapping decisions, or other baseline writes.
- **FR-017**: Baseline imports MUST be scoped to the active workspace so one planning set cannot silently affect another.

### Key Entities *(include if feature involves data)*

- **Manual Baseline**: The active optional baseline for one scope, season, and planning workspace. It represents the current expert-set Rasterzahlen captured from click-TT at a point in time.
- **Baseline Row**: One imported source assignment with click-TT labels, Rasterzahl, source location, mapping status, and optional reviewed target team.
- **Baseline Review Decision**: A scheduler decision that maps, ignores, corrects, or accepts an imported baseline row.
- **Baseline Usage**: The association between an optimizer run/snapshot and the baseline version selected for comparison.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scheduler can import and review the manual baseline for one district scope in under 5 minutes after click-TT access is configured.
- **SC-002**: 100% of imported baseline rows include source group label, source team label, Rasterzahl, source location, and import timestamp.
- **SC-003**: 0 baseline values become hard optimizer constraints unless the scheduler marks them fixed through an explicit fixed-assignment workflow.
- **SC-004**: Test fixtures with exact, ambiguous, duplicate, invalid, and unmatched source rows show every non-settled row in the review area.
- **SC-005**: Runs started with a reviewed baseline show baseline comparison counts and details on the result page.
- **SC-006**: Runs started without a baseline behave the same as today except for unchanged navigation and display context.

## Assumptions

- Schedulers have the required click-TT permissions or configured credentials to access the hidden current Rasterzahl pages.
- The manual baseline represents the expert/current click-TT state at import time and may be incomplete or stale later.
- Existing fixed upper-league and manual fixed schedule-number flows remain the only ways to create hard fixed Rasterzahl constraints.
- The first implementation may support one active manual baseline per workspace while retaining enough version identity for run snapshots and audit.
- Baseline import is a scheduler action, not a page-render side effect.
- The existing Playwright scraper is the manual baseline Rasterzahlen import path unless implementation planning proves it cannot reach the hidden current Rasterzahl pages.
