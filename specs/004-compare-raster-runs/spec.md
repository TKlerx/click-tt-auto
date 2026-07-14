# Feature Specification: Raster Run Comparison

**Feature Branch**: `004-compare-raster-runs`  
**Created**: 2026-07-12  
**Status**: Draft  
**Input**: User description: "Compare optimizer runs, CP-SAT runs, and manual schedule assignments with shared KPIs and visual entry. CP-SAT can run for several minutes; it either finishes with a solution/status or does not. Manual assignments from colleagues should be loadable, visually editable, and scored with the same KPIs as optimizer output."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare Scheduling Scenarios (Priority: P1)

As a district admin, I want to compare multiple scheduling scenarios for the same district and season so that I can decide whether the automated optimizer improves on a baseline or a colleague's manual work.

**Why this priority**: Comparison is the central value of the feature. Without it, separate runs and manual imports remain isolated artifacts and cannot support a planning decision.

**Independent Test**: Can be tested by opening a district-season with at least two completed scenarios and verifying that a side-by-side comparison shows their KPIs, result links, and relative differences.

**Acceptance Scenarios**:

1. **Given** two completed scenarios for the same district and season, **When** the admin opens the comparison view, **Then** both scenarios appear side by side with objective value, hall excess KPIs, wish misses, same-club derby issues, solver/manual status, creation time, and a link to details.
2. **Given** more than two scenarios, **When** the admin selects scenarios for comparison, **Then** the view updates to only compare the selected scenarios without losing access to the full scenario list.
3. **Given** one scenario is selected as baseline, **When** other scenarios are compared, **Then** KPI differences are shown as better, worse, or unchanged compared with the baseline.

---

### User Story 2 - Run Alternative Optimizers (Priority: P2)

As a district admin, I want to run the initial heuristic and the CP-SAT optimizer as named strategies for the same input set so that their outputs can be compared with the same scoring rules.

**Why this priority**: The admin needs confidence that CP-SAT is actually better than the initial heuristic or at least understands where each strategy differs.

**Independent Test**: Can be tested by choosing a strategy, queueing a run, waiting for completion, and confirming the resulting scenario records the chosen strategy, status, KPIs, and result details.

**Acceptance Scenarios**:

1. **Given** a validated input set, **When** the admin queues a heuristic run, **Then** a scenario is created with strategy "Initial heuristic" and progresses from queued/running to a terminal status.
2. **Given** a validated input set, **When** the admin queues a CP-SAT run, **Then** a scenario is created with strategy "CP-SAT", a configurable time budget, solver status, KPIs, and result details.
3. **Given** a CP-SAT run reaches its configured time budget, **When** the run ends with a feasible solution, **Then** the scenario is marked feasible rather than failed and remains comparable.
4. **Given** a CP-SAT run cannot produce a solution, **When** the run ends, **Then** the scenario is marked with a clear terminal status and does not appear as a valid assignment in comparisons unless explicitly included.

---

### User Story 3 - Import and Score Manual Assignments (Priority: P2)

As a district admin, I want to enter, paste, or upload a colleague's manually chosen schedule numbers so that the system can compute the same KPIs and compare the manual plan against optimizer output.

**Why this priority**: Manual plans are an important real-world baseline. The feature is less useful if comparisons only cover automated runs.

**Independent Test**: Can be tested by entering a complete manual assignment for one input set and verifying that it becomes a comparable scenario with KPIs and detail views.

**Acceptance Scenarios**:

1. **Given** a validated input set, **When** the admin opens manual assignment entry, **Then** all groups and teams are shown in a visual form with legal schedule-number choices for each group.
2. **Given** a manual assignment is incomplete, duplicated within a group, or uses an illegal schedule number, **When** the admin tries to score it, **Then** the system reports the specific group/team issues and does not create a scored scenario.
3. **Given** a complete valid manual assignment, **When** the admin scores it, **Then** the system creates a manual scenario with the same KPIs, conflicts, and detail views as optimizer scenarios.
4. **Given** a colleague provides assignment data in a pasteable table or file, **When** the admin imports it, **Then** the system maps recognizable groups/teams/schedule numbers into the visual entry form and highlights unmatched rows for correction.

---

### User Story 4 - Review Scenario Details (Priority: P3)

As a district admin, I want to inspect why one scenario is better or worse than another so that I can make adjustments or explain the decision to colleagues.

**Why this priority**: KPI totals are useful, but admins need traceability into conflicts, excesses, wish misses, and assignments before trusting a final schedule.

**Independent Test**: Can be tested by opening a scenario from the comparison view and verifying that detailed assignments, hall excesses, wish outcomes, and conflicts are visible and filterable enough to investigate the result.

**Acceptance Scenarios**:

1. **Given** a scenario with hall excesses, **When** the admin opens details, **Then** the affected club, hall, weekday, week, teams, capacity, and excess count are visible.
2. **Given** a scenario with wish misses or derby issues, **When** the admin opens details, **Then** each issue identifies the involved teams and expected versus actual outcome.
3. **Given** a manual scenario and an optimizer scenario, **When** the admin compares details, **Then** both use the same terminology and KPI definitions.

### Edge Cases

- A CP-SAT run may return a feasible but not proven-optimal assignment; the scenario must remain comparable and clearly show that status.
- A CP-SAT run may exhaust its time budget or fail without a feasible assignment; the scenario must show the failure state and avoid presenting nonexistent KPIs as valid.
- Odd-size groups use the next even schedule template with one unused schedule number chosen by the assignment; validation must accept any legal unused number.
- Manual imports may contain group names, team names, or schedule-number formats that differ from the current input set; unmatched rows must be visible for correction.
- Manual assignments may intentionally omit youth or special groups; the system must treat omitted required teams as incomplete unless the admin explicitly excludes those groups from the scenario.
- Scenarios from different districts, seasons, or input-set versions must not be compared as if they share the same baseline.
- If scoring rules or input sources change after a scenario is created, the system must make stale comparisons visible rather than silently mixing old and new assumptions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present optimizer and manual results as comparable scenarios tied to one district, season, and input set.
- **FR-002**: Users MUST be able to queue an "Initial heuristic" optimizer run for a validated input set.
- **FR-003**: Users MUST be able to queue a "CP-SAT" optimizer run for a validated input set with a visible time budget appropriate for multi-minute runs.
- **FR-004**: System MUST show each run's current phase using honest states such as queued, optimization started, completed, feasible, failed, or cancelled.
- **FR-005**: System MUST store each scenario's strategy or origin, terminal status, settings, creation time, completion time, KPI summary, and link to detailed assignments/conflicts.
- **FR-006**: System MUST compute the same KPI definitions for heuristic, CP-SAT, and manual scenarios.
- **FR-007**: KPI summary MUST include at minimum objective score, total hall excess, maximum hall excess, affected clubs, wish misses, same-club derby issues, and solver/manual status.
- **FR-008**: Users MUST be able to select two or more comparable scenarios and view their KPI summaries side by side.
- **FR-009**: Users MUST be able to choose a baseline scenario and see whether each compared KPI is better, worse, or unchanged relative to that baseline.
- **FR-010**: Users MUST be able to open scenario details from the comparison view.
- **FR-011**: Users MUST be able to create a manual scenario through a visual assignment form organized by group and team.
- **FR-012**: The visual manual form MUST limit or flag schedule-number choices to the legal schedule numbers for each group's size and mode.
- **FR-013**: Users MUST be able to paste or upload manual assignment data and review the parsed rows before scoring.
- **FR-014**: System MUST validate manual assignments for completeness, duplicate schedule numbers within a group, illegal schedule numbers, unknown groups, and unknown teams before scoring.
- **FR-015**: System MUST let users correct imported manual assignments in the visual form before computing KPIs.
- **FR-016**: System MUST create a scored manual scenario only after validation succeeds.
- **FR-017**: System MUST prevent or clearly warn when users attempt to compare scenarios from different districts, seasons, input sets, or incompatible input versions.
- **FR-018**: System MUST mark scenarios as stale when the underlying input set or scoring assumptions change after the scenario was created.
- **FR-019**: System MUST allow failed, cancelled, or no-solution runs to remain visible in history without treating them as valid assignment scenarios.
- **FR-020**: Users MUST be able to identify which scenario was produced by a colleague/manual import versus an optimizer strategy.
- **FR-021**: System SHOULD explain infeasible optimizer outcomes with actionable hard-constraint diagnostics, especially when a previous heuristic or manual assignment existed for the same input.

### Key Entities *(include if feature involves data)*

- **Scenario**: A comparable scheduling result or attempted result for one input set. Key attributes include origin/strategy, status, settings, created time, finished time, KPI summary, detail link, and staleness state.
- **Optimizer Strategy**: A selectable automated scheduling approach such as Initial heuristic or CP-SAT, including user-visible settings such as time budget where relevant.
- **Manual Assignment**: A user-provided set of schedule numbers for teams in the input set, including source label, parsed/imported rows, validation issues, and corrected values.
- **KPI Summary**: Shared scoring outputs used for comparison, including objective, hall excesses, affected clubs, wish misses, derby issues, and status.
- **Scenario Comparison**: A selected set of compatible scenarios plus an optional baseline used to show side-by-side KPIs and differences.
- **Validation Issue**: A problem preventing a manual assignment or run result from being scored or compared, such as duplicate numbers, missing teams, unknown rows, or illegal schedule numbers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A district admin can compare at least three compatible scenarios side by side in under 30 seconds after the scenarios exist.
- **SC-002**: A district admin can create and score a complete manual assignment for a 40-group season in under 15 minutes using the visual form or import-and-correct flow.
- **SC-003**: 100% of valid optimizer and manual scenarios display the same KPI categories and definitions.
- **SC-004**: 100% of invalid manual assignments identify at least one actionable issue before scoring is allowed.
- **SC-005**: Scenario status is visible for every queued or completed run, and users can distinguish waiting, running, completed, feasible, failed, and cancelled states without reading logs.
- **SC-006**: At least 90% of manually imported rows from a simple group/team/schedule-number table are either matched automatically or shown as unmatched for correction.
- **SC-007**: Users can open detailed conflict or assignment information from a compared scenario in no more than two interactions from the comparison view.

## Assumptions

- District admins are the primary users; read-only viewers may later receive comparison access but cannot create runs or manual scenarios.
- Existing validated input sets remain the prerequisite for optimizer runs and manual scenario scoring.
- CP-SAT runs may take several minutes and are acceptable as background jobs; the feature should show honest status rather than a fake percentage.
- CP-SAT with a time budget can produce optimal, feasible, infeasible, failed, or no-solution outcomes; feasible outcomes are still useful for comparison.
- CP-SAT solvers may report only "infeasible"; diagnosing the blocking constraint may require a separate relaxation or diagnostic pass.
- Manual assignment import v1 supports common table formats with group, team, and schedule-number columns; complex OCR or arbitrary PDF parsing is out of scope for this feature.
- Visual manual entry is required for v1, but advanced spreadsheet-like editing can be incremental as long as users can complete and correct an assignment.
- Scenario comparison is limited to compatible scenarios from the same district, season, and input set version unless explicitly marked otherwise.
