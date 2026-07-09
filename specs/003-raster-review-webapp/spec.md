# Feature Specification: Raster Review Webapp

**Feature Branch**: `003-raster-review-webapp`  
**Created**: 2026-07-08  
**Status**: Draft  
**Input**: User description: "Create a webapp based on ../webapp-template for different users to import optimizer snapshots and review Rasterzahl hall-capacity conflicts, overages, assignments, and capacity edits."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review Hall Conflicts (Priority: P1)

A district scheduler reviews an optimizer run and quickly understands which clubs, halls, weekdays, and match weeks exceed intended capacity.

**Why this priority**: The main risk in the Rasterzahl assignment is placing too many home matches into the same hall at the same time. The webapp must make those conflicts visible before any broader workflow matters.

**Independent Test**: Can be fully tested by loading a completed optimizer snapshot and verifying that the overview, club grouping, and conflict list show the same overages as the source review files.

**Acceptance Scenarios**:

1. **Given** an imported optimizer snapshot with hall overages, **When** a scheduler opens the conflict overview, **Then** they see total overages, maximum excess, affected clubs, and a prioritized list of conflicts.
2. **Given** a club with repeated conflicts, **When** a scheduler filters by that club, **Then** they see only that club's conflict weeks, hall, weekday, capacity, actual team count, excess, and involved teams.
3. **Given** a snapshot with no overages, **When** a scheduler opens the conflict overview, **Then** the app shows that no hall-capacity conflicts were found and still allows assignment review.

---

### User Story 2 - Review Team Raster Assignments (Priority: P2)

A scheduler reviews the proposed Rasterzahl assignment for every team and can verify which assignments are optimized, fixed, pinned, or still need attention.

**Why this priority**: Conflict review only explains where the proposal hurts. Schedulers also need the concrete team-to-Rasterzahl output to judge whether the proposal can be used.

**Independent Test**: Can be fully tested by loading a snapshot and comparing the assignment table against the generated assignment review output.

**Acceptance Scenarios**:

1. **Given** an imported optimizer snapshot, **When** a scheduler opens the assignment view, **Then** they see league, group, club, team, Rasterzahl, assignment status, weekday, hall, start time, and week slot.
2. **Given** many assignments, **When** a scheduler searches or filters by club, league, group, or assignment status, **Then** the table updates without losing the selected snapshot context.
3. **Given** a team with a fixed or pinned Rasterzahl, **When** it appears in the assignment table, **Then** that status is visible and distinguishable from optimized assignments.

---

### User Story 3 - Manage Hall Capacity Review (Priority: P3)

An admin or scheduler reviews inferred hall capacity, records known real capacity for a club/hall/weekday, and sees which conflicts would require data correction or a new optimizer run.

**Why this priority**: Many apparent conflicts are likely caused by missing real capacity data. The app must support review and correction without hiding the difference between inferred and known capacity.

**Independent Test**: Can be fully tested by opening a club/day/hall capacity entry, changing its review value, and verifying that the app marks related conflicts as requiring a refreshed optimizer run.

**Acceptance Scenarios**:

1. **Given** a conflict caused by missing or inferred capacity, **When** a scheduler opens its capacity detail, **Then** they can see the current capacity basis and record a reviewed capacity value.
2. **Given** a reviewed capacity value has been changed, **When** the scheduler returns to the conflict overview, **Then** affected conflicts are marked as stale until a new snapshot is imported.
3. **Given** a user without capacity-edit permission, **When** they view capacity detail, **Then** they can read capacity information but cannot change it.

---

### User Story 4 - Coordinate Review With Roles (Priority: P4)

Different users participate in the review with appropriate permissions: admins manage users and imports, schedulers review and edit capacity, and viewers inspect results read-only.

**Why this priority**: Multiple people may help review the district data, but not everyone should change capacity inputs or import new optimizer runs.

**Independent Test**: Can be fully tested by signing in as each role and verifying allowed and blocked actions across import, conflict review, capacity edit, and user administration.

**Acceptance Scenarios**:

1. **Given** an admin user, **When** they access the app, **Then** they can import snapshots, manage users, edit capacity, and review conflicts.
2. **Given** a scheduler user, **When** they access the app, **Then** they can review conflicts and edit capacity but cannot manage users.
3. **Given** a viewer user, **When** they access the app, **Then** they can view snapshots, assignments, and conflicts but cannot import, edit, or approve.

---

### User Story 5 - Run Exact Optimization (Priority: P5)

An admin starts an optimization run from reviewed input data and later sees whether the run found a proven optimal assignment, a feasible but not proven assignment, or no valid assignment.

**Why this priority**: Imported snapshots are enough for first review, but the app should ultimately close the loop by running the optimizer after users correct hall capacities and input data.

**Independent Test**: Can be fully tested by submitting a reviewed model for optimization, waiting for completion, and verifying that the resulting snapshot includes assignment output, conflict output, objective value, and solver status.

**Acceptance Scenarios**:

1. **Given** reviewed input data, **When** an admin starts an optimization run, **Then** the app records the run as pending and shows progress/status without blocking review of other snapshots.
2. **Given** an optimization run finishes with a proven optimum, **When** a scheduler opens the generated snapshot, **Then** the snapshot clearly states that the assignment is optimal for the configured objective and constraints.
3. **Given** an optimization run reaches its configured limit before proof of optimality, **When** a scheduler opens the generated snapshot, **Then** the snapshot clearly states that the assignment is feasible but not proven optimal.
4. **Given** no valid assignment exists under the hard constraints, **When** the run finishes, **Then** the app reports that no feasible solution was found and shows the relevant blocking constraints where available.

### Edge Cases

- Import data is incomplete, malformed, or belongs to a different optimizer run than the selected snapshot.
- A club name differs between assignment, conflict, and capacity inputs.
- A snapshot has assignments but no conflict file.
- A conflict references a team that is missing from the assignment table.
- A capacity edit would reduce capacity below the actual number of teams in an already reviewed conflict.
- Two users review the same snapshot while one changes capacity data.
- A new snapshot is imported after users already reviewed an older snapshot.
- An optimization run is still pending, fails, times out, or returns a feasible assignment without proof of optimality.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow authorized users to import a complete optimizer review snapshot containing assignments, conflict rows, per-club excess summaries, and evaluation summary data.
- **FR-002**: The system MUST retain imported snapshots as separate review versions so users can compare or revisit past optimizer runs.
- **FR-003**: The system MUST show a conflict overview with total conflicts, total excess, maximum excess, affected club count, and the highest-impact clubs.
- **FR-004**: Users MUST be able to filter conflicts by club, weekday, hall, match week, and excess severity.
- **FR-005**: Each conflict MUST show match week, club, weekday, hall, capacity, actual home-match count, excess, involved teams, and the source snapshot.
- **FR-006**: The system MUST show a per-club conflict summary with overage count and total excess for each affected club.
- **FR-007**: The system MUST show a team assignment view with league, group, club, team, Rasterzahl, assignment status, weekday, hall, start time, and week slot.
- **FR-008**: Users MUST be able to search and filter assignments by club, league, group, team, Rasterzahl, and assignment status.
- **FR-009**: The system MUST distinguish optimized, fixed, pinned, and missing assignment states wherever assignments are displayed.
- **FR-010**: Authorized users MUST be able to record reviewed hall capacity for a club, hall, and weekday.
- **FR-011**: The system MUST distinguish reviewed capacity from inferred or missing capacity.
- **FR-012**: When capacity data changes after a snapshot import, the system MUST mark affected conflict and summary views as stale until a newer snapshot is imported.
- **FR-013**: The system MUST support at least three user permission levels: admin, scheduler, and viewer.
- **FR-014**: Admin users MUST be able to import snapshots, manage users, edit capacity, and review all data.
- **FR-015**: Scheduler users MUST be able to review snapshots and edit capacity but MUST NOT be able to manage users.
- **FR-016**: Viewer users MUST be able to inspect snapshots, assignments, and conflicts but MUST NOT be able to import or edit review data.
- **FR-017**: The system MUST keep an audit trail of snapshot imports, capacity edits, and review status changes, including who performed the action and when.
- **FR-018**: Users MUST be able to mark a conflict or club summary as reviewed, needs data correction, or accepted as unavoidable.
- **FR-019**: The system MUST prevent accidental mixing of files from different optimizer runs by warning users when imported files disagree on snapshot identity or row counts.
- **FR-020**: The system MUST provide clear empty and error states for missing snapshots, no conflicts, import failures, and permission-denied actions.
- **FR-021**: Admin users MUST be able to start an optimization run from reviewed input data.
- **FR-022**: The system MUST process optimization runs asynchronously so users can continue reviewing existing snapshots while a run is pending.
- **FR-023**: Each completed optimization run MUST report one of these outcomes: proven optimal, feasible but not proven optimal, infeasible, failed, or cancelled.
- **FR-024**: For proven optimal and feasible runs, the system MUST create a review snapshot containing assignment output, conflict output, objective value, solver status, and run settings.
- **FR-025**: The system MUST clearly distinguish proven optimal assignments from heuristic or feasible-only assignments in all snapshot and assignment views.

### Key Entities *(include if feature involves data)*

- **User**: A person who signs into the review app and has one or more permissions through a role.
- **Role**: A permission level that determines whether a user can import snapshots, edit capacity, review conflicts, or only view data.
- **Optimizer Snapshot**: A saved review version of one optimizer run, including summary metrics and imported review artifacts.
- **Optimization Run**: A requested calculation from reviewed input data with status, settings, objective value, and final outcome.
- **Conflict**: A hall-capacity overage for one club, hall, weekday, and match week.
- **Assignment**: A team-to-Rasterzahl result with context such as league, group, club, weekday, hall, and assignment status.
- **Hall Capacity**: The reviewed or inferred maximum number of parallel home matches for one club, hall, and weekday.
- **Review Decision**: A user-entered status and optional note for a conflict or club summary.
- **Audit Event**: A record of a significant user action during import, review, or capacity editing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scheduler can identify the top 10 clubs by total excess within 30 seconds of opening a snapshot.
- **SC-002**: A scheduler can drill from a club summary to the exact match weeks and teams causing its conflicts in under 3 clicks.
- **SC-003**: At least 95% of imported conflict rows are visible with their club, hall, weekday, match week, capacity, actual count, excess, and teams.
- **SC-004**: A scheduler can find a specific team's Rasterzahl assignment within 15 seconds using search or filters.
- **SC-005**: Role checks prevent 100% of non-authorized capacity edits, snapshot imports, and user-management actions during acceptance testing.
- **SC-006**: After a capacity edit, all affected snapshot views visibly indicate stale review data before the user can treat the old conflicts as final.
- **SC-007**: Import validation identifies mismatched or incomplete snapshot inputs before users begin review.
- **SC-008**: At least 95% of completed optimization runs display their final outcome, objective value, and generated snapshot link without manual log inspection.
- **SC-009**: Users can distinguish proven optimal, feasible-only, and imported heuristic snapshots within 5 seconds of opening a snapshot.

## Assumptions

- The first usable release may start as a review tool for completed optimizer outputs, but the target workflow includes starting exact optimization runs from the app.
- User login, user administration, and basic role management are provided by the existing internal application baseline.
- The first supported snapshot inputs are the generated assignment review, conflict report, per-club overage summary, and evaluation summary currently produced by the Rasterzahl workflow.
- Reviewed capacity values are maintained separately from imported snapshots so old snapshots remain historically understandable.
- Mobile access is useful but desktop/tablet review is the primary workflow for the first release.
- A new optimizer snapshot is required after capacity edits before conflict counts can be considered final.
