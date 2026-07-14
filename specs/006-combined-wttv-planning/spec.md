# Feature Specification: Combined WTTV Planning

**Feature Branch**: `006-combined-wttv-planning`  
**Created**: 2026-07-14  
**Status**: Draft — User Story 2 gated on a feasibility spike (Q1)  
**Input**: User description: "Maybe we have a separate selection that works on all districts, verband, etc (so on all things at the same time) as a separate selection. But that only works if all inputs are already filled for all clubs/teams for the whole wttv."

**Split from**: `specs/005-raster-guided-navigation/` (Q3, resolved 2026-07-14).  
**Depends on**: 005 for the scope-keyed input set (FR-020) and the guided flow it plugs into. FR-026 of 005 exists to keep this feature buildable.

**Terminology**: "Scope" is the existing system's word for a level of the Germany → Verband → Bezirk tree. A Bezirk is a scope; the Verband (WTTV) is a scope. Where this spec says "a scope", read "a Bezirk or the Verband".

## Context: why this is a separate feature

Today, planning runs one scope at a time, and the order matters. A Bezirk's input set takes the Verband's **already-decided** upper-league Rasterzahlen as fixed hard constraints (`specs/003-raster-review-webapp/spec.md`: the optimizer runs "respecting the fixed upper-league Rasterzahlen and hall capacities as constraints"). So the Verband is planned first and every Bezirk inherits its decisions, whether or not those decisions suit the Bezirk.

Combined planning removes that ordering. When the Verband and all its Bezirke are solved as one problem, upper-league Rasterzahlen stop being fixed inputs and become decisions the optimizer makes with full knowledge of their downstream cost. That is the value: not "the same run, bigger", but a run that is no longer downstream of a decision made without this information.

`specs/003-raster-review-webapp/spec.md` already contemplated this endpoint — "A full WTTV or district run may proceed with zero fixed numbers" — while deliberately scoping the first release to district scale (hundreds of assignments per snapshot) and deferring county-wide scale (~1,400 clubs/teams). This feature is that deferred step.

Three things make it separate work rather than a mode toggle:

- **The data model cannot express it.** An input set is keyed to one scope. Spanning several requires a new shape.
- **Solver feasibility at this size is unestablished.** One Bezirk is hundreds of assignments; the Verband plus 13 Bezirke is roughly 1,400 clubs/teams, with the upper-league numbers newly unfixed and therefore more freedom, not less. Nobody has shown CP-SAT solves this in acceptable time. See Q1.
- **The gate is organizational.** It is unusable until all 13 Bezirke have complete data, which no code change can bring about.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See whether the whole WTTV is ready to plan (Priority: P1)

An admin looks at one place and sees, for a season, which scopes have complete inputs and which do not, and for each incomplete scope what is missing. They use it to chase the Bezirke that are holding things up.

**Why this priority**: It is the only part of this feature that is useful immediately, it carries no solver risk, and it is a precondition for everything else here — the combined selection cannot be offered without knowing whether inputs are complete. It also has standalone value even if combined running never ships, because the same question ("is everyone's data in yet?") is asked every season regardless.

**Independent Test**: With several scopes at different levels of completeness for a season, open the readiness overview and verify each scope's state and each incomplete scope's missing items are correct. No run is started.

**Acceptance Scenarios**:

1. **Given** a season where every scope has complete inputs, **When** the admin opens the readiness overview, **Then** every scope is shown as complete.
2. **Given** a season where some scopes are incomplete, **When** the admin opens the readiness overview, **Then** each incomplete scope is listed with what is missing.
3. **Given** an incomplete scope, **When** the admin selects it from the overview, **Then** they reach that scope's guided flow at the step that resolves the gap.
4. **Given** a scope's sources change, **When** the admin returns to the readiness overview, **Then** that scope's state reflects the change.
5. **Given** a user who can access only some scopes, **When** they open the readiness overview, **Then** they see only the scopes they can access, and the overview does not imply the rest are complete.

---

### User Story 2 - Plan the whole WTTV in one combined run (Priority: P2)

Once every scope's inputs are complete for a season, an admin chooses a combined selection — distinct from picking any single scope — and plans the Verband and all its Bezirke together as one problem. Upper-league Rasterzahlen are decided by this run rather than supplied to it. The result is a single snapshot covering every scope.

**Why this priority**: This is the point of the feature, but it is second because it is unusable until User Story 1 reports everything complete, and because its feasibility is unproven (Q1). Shipping User Story 1 first means the feasibility question can be answered with real data rather than guessed at.

**Independent Test**: With every scope complete for a season, start a combined run and verify it produces one snapshot spanning all scopes, in which upper-league Rasterzahlen are assigned rather than taken as fixed input.

**Acceptance Scenarios**:

1. **Given** any scope has incomplete inputs, **When** the admin selects the combined selection, **Then** the system names the incomplete scopes and does not allow a run to start.
2. **Given** every scope has complete inputs, **When** the admin starts a combined run, **Then** one run is created covering all scopes and it is processed asynchronously like any other run.
3. **Given** a combined run, **When** it assigns Rasterzahlen, **Then** upper-league Rasterzahlen are decided by the run, and no scope's plan is constrained by an upper-league number decided in an earlier separate run.
4. **Given** an admin supplies fixed schedule numbers for a combined input set, **When** the run executes, **Then** those numbers are honoured as hard constraints exactly as they are for a single-scope run.
5. **Given** a combined run is queued or running, **When** a source in any spanned scope changes, **Then** the admin is told the combined result may no longer reflect current sources.
6. **Given** a user who cannot access every spanned scope, **When** they open Raster, **Then** the combined selection is not offered to them.

---

### User Story 3 - Review a combined result and tell it apart from a single-scope one (Priority: P3)

A scheduler opens the outcome of a combined run and can see that it covers every scope rather than one, can review its assignments and conflicts per scope, and can tell at a glance that a snapshot came from a combined run.

**Why this priority**: Without it, a combined snapshot is indistinguishable from a single-scope one and a scheduler could act on the wrong plan. It depends on User Story 2 producing something to review, so it cannot come earlier, but it is separately testable against any combined snapshot.

**Independent Test**: Open a combined snapshot alongside a single-scope snapshot and verify the combined one is identifiable as such and can be reviewed scope by scope.

**Acceptance Scenarios**:

1. **Given** a completed combined run, **When** the scheduler opens its snapshot, **Then** the snapshot states that it covers all scopes.
2. **Given** a combined snapshot, **When** the scheduler reviews assignments or conflicts, **Then** they can narrow the view to one scope without leaving the snapshot.
3. **Given** a list containing both combined and single-scope snapshots, **When** the scheduler scans it, **Then** combined snapshots are distinguishable from single-scope ones.
4. **Given** a combined snapshot exists, **When** the scheduler opens a single scope's own snapshots, **Then** those are unchanged and still reviewable.

---

### Edge Cases

- A scope has no input set at all for the season, as distinct from having an incomplete one.
- A new Bezirk is added to the hierarchy mid-season, changing what "all scopes" means.
- A scope's inputs become incomplete after a combined input set was assembled but before the run starts.
- A scope's sources change while a combined run is executing.
- A combined run is started while single-scope runs are queued for scopes it spans.
- The combined run exceeds any run time limit, or the solver returns no proven optimum within it.
- The combined run is infeasible, and the admin needs to know which scope's constraints caused it.
- A user can access every scope today but loses access to one while a combined run is in flight.
- A combined snapshot and a single-scope snapshot disagree about the same team's Rasterzahl.
- A combined input set exists for a season, and an admin then wants to plan one Bezirk on its own anyway.

## Requirements *(mandatory)*

### Functional Requirements

#### Readiness overview

- **FR-001**: The system MUST show, for a season, the input completeness of every scope in the Verband.
- **FR-002**: Inputs for a scope count as complete when all of the following hold:
  - **FR-002a**: Every group and every team in the scope is known.
  - **FR-002b**: Every team has a matched wish carrying its game day (home weekday), gym, and start time.
  - **FR-002c**: Every gym capacity implied by those wishes is stored, and no stored capacity is lower than the wishes require.
- **FR-003**: A team whose parsed wish carries no game week A/B preference MUST count as complete. Absence of an A/B preference is a legitimate value, not missing data.
- **FR-004**: For each incomplete scope, the system MUST name which of FR-002a-c is unmet.
- **FR-005**: The readiness overview MUST let a user reach an incomplete scope's guided flow at the step that resolves the gap.
- **FR-006**: The readiness overview MUST reflect source changes without requiring the user to re-derive completeness by hand.
- **FR-007**: Users MUST see readiness only for scopes they can access, and the overview MUST NOT imply anything about scopes they cannot see.

#### Combined selection and run

- **FR-010**: The system MUST offer a combined selection, distinct from selecting any single scope, that plans the Verband and all its Bezirke together for a season as one problem.
- **FR-011**: An input set for the combined selection MUST be able to span multiple scopes.
- **FR-012**: The system MUST NOT allow a combined run to start unless FR-002 holds for every spanned scope.
- **FR-013**: A combined run MUST decide upper-league Rasterzahlen rather than accept them as fixed input, so that no spanned scope is constrained by an upper-league number decided in an earlier separate run.
- **FR-014**: Fixed schedule numbers explicitly supplied for a combined input set MUST be honoured as hard constraints, consistent with single-scope runs.
- **FR-015**: The combined selection MUST only be available to users who can access every scope it spans.
- **FR-016**: When any spanned scope's sources change, the system MUST re-evaluate the combined input set's completeness and warn if a queued or running combined run may no longer reflect current sources.
- **FR-017**: Combined input sets, runs, and snapshots MUST NOT alter or replace any single-scope input set, run, or snapshot, and single-scope planning MUST remain fully usable.
- **FR-018**: A combined run MUST be processed asynchronously and be observable in the same way as a single-scope run.
- **FR-019**: When a combined run is infeasible, the system MUST indicate which scope's constraints could not be satisfied.

#### Combined results

- **FR-020**: A snapshot produced by a combined run MUST state that it covers all scopes, and MUST NOT be presented as belonging to a single scope.
- **FR-021**: Combined snapshots MUST be distinguishable from single-scope snapshots wherever snapshots are listed.
- **FR-022**: A scheduler MUST be able to narrow a combined snapshot's assignments and conflicts to one scope without leaving the snapshot.

### Key Entities

- **Combined input set**: An input set spanning the Verband and all its Bezirke for a season, rather than one scope. New; the current model cannot express it. Carries completeness across every spanned scope.
- **Scope readiness**: Per scope and season, whether FR-002 holds, and if not, which parts are unmet. Derived from existing data.
- **Combined snapshot**: The result of a combined run. Covers every scope and is marked as such.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can tell whether the whole WTTV is ready to plan for a season in under 10 seconds, without opening any scope.
- **SC-002**: For any incomplete scope, an admin can identify what is missing and reach the step that fixes it in one interaction.
- **SC-003**: The combined selection is never startable while any spanned scope is incomplete.
- **SC-004**: A combined run's plan for any scope is never constrained by an upper-league Rasterzahl decided in an earlier separate run.
- **SC-005**: A combined snapshot is identifiable as combined within 5 seconds of opening it, and within a snapshot list without opening it.
- **SC-006**: Single-scope planning produces identical results before and after this feature exists.
- **SC-007**: No user sees readiness for, or can start a combined run spanning, a scope they cannot access.

## Assumptions

- The combined selection spans the Verband and all its Bezirke for one season. It is not a free multi-select of arbitrary scopes; planning two Bezirke together without the rest was not requested.
- The completeness gate matches the standard a single-scope run already meets, so a combined run can never start on data a single-scope run would refuse. Gym capacity "being there" means stored and not lower than the wishes require; there is no reviewed/confirmed flag on a capacity today and this feature does not add one.
- Game week A/B is fidelity, not a gate: carried through when a source specifies it, and its absence is a real answer.
- Combined runs are additive. Single-scope planning keeps working unchanged, and a combined run does not supersede single-scope snapshots. Which plan is authoritative is an operational decision, not a system one.
- The existing optimizer is reused for combined runs, as it is for single-scope runs. This feature does not reimplement the solver — but see Q1: whether it can absorb this problem size is unestablished.
- Fixed schedule numbers remain optional for a combined run, as they are for a single-scope run.
- The guided flow, scope keying, and scope reference from feature 005 exist before this feature is built.
- Scope access rules, roles, and audit behaviour carry over unchanged.

## Out of Scope

- Any change to the guided navigation itself (feature 005).
- Fuzzy club/team match scoring, confidence display, and persisted aliases (tasks T079-T082 in `specs/003-raster-review-webapp/`).
- Planning arbitrary subsets of scopes together.
- Changing what the optimizer optimizes for. This feature changes which decisions are the optimizer's to make, not the objective it pursues.
- Any change to import parsers or source formats.
- Automating the organizational work of getting 13 Bezirke to complete their data. This feature reports on it; it does not chase it.

## Open Questions

- **Q1 (blocking User Story 2, needs a spike before planning)**: Can the existing CP-SAT optimizer solve the combined problem in acceptable time? The Verband plus 13 Bezirke is roughly 1,400 clubs/teams versus hundreds of assignments for one Bezirk, and unfixing the upper-league Rasterzahlen (FR-013) adds freedom rather than removing it, so this is not a linear scale-up. If the answer is no, this feature needs either a decomposition strategy or a different objective, and its shape changes substantially. User Story 1 is unaffected and can be planned and built regardless.
- **Q2**: What is the acceptable wall-clock limit for a combined run? Single-scope runs default to a 300-second limit. A combined run plausibly needs a different one, and the answer interacts with Q1.
- **Q3**: When a combined snapshot and a single-scope snapshot disagree about a team, which is authoritative, and does the system need to say so or is that an operational convention? Assumed operational for now (see Assumptions), but worth confirming before User Story 3 is built.
