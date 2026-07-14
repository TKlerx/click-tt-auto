# Feature Specification: Combined WTTV Planning

**Feature Branch**: `006-combined-wttv-planning`  
**Created**: 2026-07-14  
**Status**: Draft — reshaped 2026-07-14 from a gated all-WTTV run to a subset run with persisted incompleteness  
**Input**: User description: "Maybe we have a separate selection that works on all districts, verband, etc (so on all things at the same time) as a separate selection. But that only works if all inputs are already filled for all clubs/teams for the whole wttv." — later revised (see Clarifications): a subset run with incomplete inputs is wanted **now**, marked as incomplete, because running the optimizer with deliberately incomplete constraints is how it gets exercised.

**Split from**: `specs/005-raster-guided-navigation/` (Q3, resolved 2026-07-14).  
**Depends on**: 005 for the scope-keyed input set (FR-020) and the guided flow it plugs into. FR-026 of 005 exists to keep this feature buildable.

**Terminology**: "Scope" is the existing system's word for a level of the Germany → Verband → Bezirk tree. A Bezirk is a scope; the Verband (WTTV) is a scope. Where this spec says "a scope", read "a Bezirk or the Verband".

## Clarifications

### Session 2026-07-14

- Q: For the combined run, does a Bezirk with excluded groups count as incomplete? → A: Exclusion is not only a wait-for-wishes device; it is also how the optimizer gets exercised with deliberately incomplete constraints, to see what it does. A combined run should be possible over a chosen subset — not every group, not even every district.
- Q: Is combined a gated all-WTTV run, or an experiment over any subset? → A: A subset run, with the subset and any incompleteness **marked as such and persisted** next to the run. Completeness stops being a gate and becomes a recorded property of the result. The all-WTTV run is the fully-complete case of the same mechanism, not a separate mode.

## Context: why this is a separate feature

Today, planning runs one scope at a time, and the order matters. A Bezirk's input set takes the Verband's **already-decided** upper-league Rasterzahlen as fixed hard constraints (`specs/003-raster-review-webapp/spec.md`: the optimizer runs "respecting the fixed upper-league Rasterzahlen and hall capacities as constraints"). So the Verband is planned first and every Bezirk inherits its decisions, whether or not those decisions suit the Bezirk.

Combined planning removes that ordering. When the Verband and all its Bezirke are solved as one problem, upper-league Rasterzahlen stop being fixed inputs and become decisions the optimizer makes with full knowledge of their downstream cost. That is the value: not "the same run, bigger", but a run that is no longer downstream of a decision made without this information.

`specs/003-raster-review-webapp/spec.md` already contemplated this endpoint — "A full WTTV or district run may proceed with zero fixed numbers" — while deliberately scoping the first release to district scale (hundreds of assignments per snapshot) and deferring county-wide scale (~1,400 clubs/teams). This feature is that deferred step.

Two things make it separate work rather than a mode toggle:

- **The data model cannot express it.** An input set is keyed to one scope. Spanning several requires a new shape.
- **Solver feasibility at full size is unestablished.** One Bezirk is hundreds of assignments; the Verband plus 13 Bezirke is roughly 1,400 clubs/teams, with the upper-league numbers newly unfixed and therefore more freedom, not less. Nobody has shown CP-SAT solves that in acceptable time. See Q1 — though subset runs make this discoverable rather than a matter for a spike.

A third reason previously given here — that the feature is unusable until all 13 Bezirke have complete data — **no longer holds**, and its removal is why this spec was reshaped. See below.

## Context: completeness is a property of the result, not a gate

The original framing was all-or-nothing: the combined selection spans every scope, and cannot run until every club and team across the whole Verband has complete inputs. That made this feature hostage to an organisational change no code could bring about.

That framing was wrong about how the tool is actually used. Excluding groups is not only how a Bezirk proceeds while waiting for wishes — it is also how the optimizer gets **exercised with deliberately incomplete constraints**, to see what it does. The same intent applies here: a combined run over two or three Bezirke, with gaps, is useful *now*, precisely because it is incomplete.

So completeness is not a precondition. It is a **recorded property of the run**: which scopes were spanned, which groups were included, what was missing. Persisted, and shown wherever the run or its snapshot appears. The all-WTTV run every scope complete is simply the case where that record says "nothing was missing" — the fully-complete instance of one mechanism, not a separate mode.

Two consequences:

- **Nothing waits on the organisation.** Subset runs are useful from the first day this ships.
- **The solver question becomes empirical.** Q1 asks whether CP-SAT absorbs ~1,400 teams. With subset runs, that is answered by adding Bezirke until it strains — not by a spike guessing in advance.

This also settles feature 005's Q4, which asked whether a snapshot from a partial run should be marked as partial. That was declined in 005 on the grounds it was "the same hazard feature 006 must solve for combined snapshots, and should be solved once across both rather than bolted on". The mechanism specified here is that solution, and it covers a single-scope run with excluded groups as readily as a combined subset run — the question is the same either way: **did this run see everything?**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a combined optimization over a chosen subset (Priority: P1)

An admin picks several scopes — two Bezirke, or the Verband plus three Bezirke, or eventually everything — and plans them together as one problem. Incomplete inputs do not prevent it: gaps and excluded groups are allowed, and the run records what it did not see. Upper-league Rasterzahlen are decided by the run rather than supplied to it.

**Why this priority**: This is the feature, and it is now buildable immediately. It was previously second because it waited on all 13 Bezirke completing their data — a wait that no longer exists once incompleteness is recorded rather than forbidden. It is also how the solver question gets answered: start with two Bezirke, add more, watch what happens.

**Independent Test**: Select two Bezirke, one with excluded groups and missing wishes, start a combined run, and verify it produces one snapshot covering both, marked as incomplete, with upper-league Rasterzahlen assigned rather than taken as fixed input.

**Acceptance Scenarios**:

1. **Given** a season, **When** the admin opens the combined selection, **Then** they can choose any set of scopes they can access, from two to all of them.
2. **Given** a chosen subset with incomplete inputs, **When** the admin starts a combined run, **Then** it starts, and is not refused for incompleteness.
3. **Given** a combined run, **When** it assigns Rasterzahlen, **Then** upper-league Rasterzahlen are decided by the run, and no spanned scope's plan is constrained by an upper-league number decided in an earlier separate run.
4. **Given** an admin supplies fixed schedule numbers for a combined input set, **When** the run executes, **Then** those numbers are honoured as hard constraints exactly as for a single-scope run.
5. **Given** a combined run is queued or running, **When** a source in any spanned scope changes, **Then** the admin is told the result may no longer reflect current sources.
6. **Given** a user who cannot access every scope in a subset, **When** they build a combined selection, **Then** they cannot include a scope they cannot access.
7. **Given** a combined run, **When** it is processed, **Then** it runs asynchronously and is observable exactly as a single-scope run is.

---

### User Story 2 - Know what a run did not see (Priority: P1)

Every run records what it covered and what it lacked: which scopes were spanned, which groups were excluded, which teams had no wish, which gym capacities were missing or below requirement. That record is persisted with the run and shown wherever the run or its snapshot appears, so nobody mistakes a two-Bezirk experiment with gaps for a plan.

**Why this priority**: Equal first, and deliberately so. User Story 1 without this produces snapshots indistinguishable from real plans — which is worse than not having User Story 1 at all. The point of allowing incomplete runs is that they are *known* to be incomplete. These ship together.

**Independent Test**: Run a combined subset with gaps, then a fully complete single-scope run. Verify the first is marked incomplete with its specific gaps named, the second is not, and both are distinguishable in a snapshot list without opening either.

**Acceptance Scenarios**:

1. **Given** a run over a subset of scopes, **When** it completes, **Then** its record names which scopes it spanned and that it did not span all of them.
2. **Given** a run whose inputs had gaps, **When** it completes, **Then** its record names the gaps: excluded groups, teams without wishes, missing or insufficient gym capacities.
3. **Given** a run that spanned everything with no gaps, **When** it completes, **Then** its record states it was complete, and it is not marked incomplete.
4. **Given** a list of snapshots, **When** a scheduler scans it, **Then** incomplete runs are distinguishable from complete ones without opening any.
5. **Given** a single-scope run with excluded groups, **When** it completes, **Then** it is marked incomplete by the same mechanism — this is not combined-only (settles feature 005's Q4).
6. **Given** an incomplete run's snapshot, **When** a scheduler opens it, **Then** what was missing is visible there, not only in the run list.
7. **Given** a run's record, **When** the underlying data later changes, **Then** the record still describes what the run saw at the time, not what is true now.

---

### User Story 3 - Review a combined result scope by scope (Priority: P2)

A scheduler opens a combined run's outcome and can narrow its assignments and conflicts to one scope at a time, without leaving the snapshot, and can see that single-scope planning for those scopes is untouched.

**Why this priority**: A combined snapshot covering several Bezirke is unreviewable as one undifferentiated list — a scheduler works one Bezirk at a time. But User Story 2 already prevents the dangerous confusion (mistaking an incomplete run for a plan), so this is comfort rather than safety.

**Independent Test**: Open a combined snapshot spanning three Bezirke and verify assignments and conflicts can be narrowed to each in turn.

**Acceptance Scenarios**:

1. **Given** a combined snapshot, **When** the scheduler reviews assignments or conflicts, **Then** they can narrow the view to one spanned scope without leaving the snapshot.
2. **Given** a combined snapshot exists, **When** the scheduler opens a single scope's own snapshots, **Then** those are unchanged and still reviewable.
3. **Given** a combined snapshot, **When** the scheduler opens it, **Then** it states which scopes it covers rather than appearing to belong to one.
4. **Given** a list containing both combined and single-scope snapshots, **When** the scheduler scans it, **Then** combined snapshots are distinguishable from single-scope ones without opening either — independently of whether either is marked incomplete.

---

### User Story 4 - See which scopes are ready to plan (Priority: P3)

An admin looks at one place and sees, for a season, which scopes have complete inputs and which do not, and what is missing in each. They use it to chase the Bezirke holding things up, and to decide which scopes to include in a combined run.

**Why this priority**: Demoted from P1. It was the precondition for everything when completeness was a gate; now that runs record their own gaps, it is a planning aid rather than a gatekeeper. Still genuinely useful — "is everyone's data in yet?" is asked every season — but nothing waits on it.

**Independent Test**: With several scopes at different levels of completeness, open the readiness overview and verify each scope's state and missing items are correct. No run is started.

**Acceptance Scenarios**:

1. **Given** a season where some scopes are incomplete, **When** the admin opens the readiness overview, **Then** each incomplete scope is listed with what is missing.
2. **Given** an incomplete scope, **When** the admin selects it from the overview, **Then** they reach that scope's guided flow at the step that resolves the gap.
3. **Given** a scope's sources change, **When** the admin returns to the overview, **Then** that scope's state reflects the change.
4. **Given** a user who can access only some scopes, **When** they open the overview, **Then** they see only those scopes, and the overview does not imply the rest are complete.

---

### Edge Cases

- A scope has no input set at all for the season, as distinct from having an incomplete one — the run spans it and finds nothing.
- A new Bezirk is added to the hierarchy mid-season, changing what "every scope" means, and therefore whether an earlier run that spanned "everything" still did.
- A scope's inputs change between assembling a combined input set and starting the run, so the coverage record and the pre-run warning disagree.
- A scope's sources change while a combined run is executing.
- A combined run is started while single-scope runs are queued for scopes it spans.
- A combined run exceeds the run time limit, or the solver returns no proven optimum within it.
- A combined run is infeasible, and the admin needs to know which spanned scope's constraints caused it.
- A user can access every scope today but loses access to one while a combined run is in flight.
- A combined snapshot and a single-scope snapshot disagree about the same team's Rasterzahl.
- A combined input set exists for a season, and an admin then wants to plan one Bezirk on its own anyway.
- A subset selection of exactly one scope — indistinguishable from a single-scope run, and should probably be refused rather than quietly duplicating the normal flow.
- Every gap in an incomplete run is later filled, and someone expects the old run's record to update. It must not (FR-038).
- A run spanning every scope with no gaps: the only case that is not marked incomplete, and therefore the one whose marking logic is least exercised.

## Requirements *(mandatory)*

### Functional Requirements

#### Combined selection and run

- **FR-010**: The system MUST offer a combined selection, distinct from selecting any single scope, that plans several scopes together for a season as one problem.
- **FR-010a**: The combined selection MUST accept any subset of scopes the user can access, from two up to every scope. Spanning everything is the complete case of this mechanism, not a separate mode.
- **FR-011**: An input set for the combined selection MUST be able to span multiple scopes.
- **FR-012**: The system MUST NOT refuse a combined run for incomplete inputs. Incompleteness is recorded (FR-030) rather than forbidden. Running the optimizer with deliberately incomplete constraints is a supported use, not an error.
- **FR-012a**: The system MUST show what is missing before a run starts, so incompleteness is a choice rather than an accident.
- **FR-013**: A combined run MUST decide upper-league Rasterzahlen rather than accept them as fixed input, so that no spanned scope is constrained by an upper-league number decided in an earlier separate run.
- **FR-014**: Fixed schedule numbers explicitly supplied for a combined input set MUST be honoured as hard constraints, consistent with single-scope runs.
- **FR-015**: A user MUST NOT be able to include a scope they cannot access in a combined selection.
- **FR-016**: When any spanned scope's sources change, the system MUST warn that a queued or running combined run may no longer reflect current sources.
- **FR-017**: Combined input sets, runs, and snapshots MUST NOT alter or replace any single-scope input set, run, or snapshot, and single-scope planning MUST remain fully usable.
- **FR-018**: A combined run MUST be processed asynchronously and be observable in the same way as a single-scope run.
- **FR-019**: When a combined run is infeasible, the system MUST indicate which spanned scope's constraints could not be satisfied.

#### Coverage record

- **FR-030**: Every run MUST carry a persisted record of what it covered and what it lacked, written when the run starts and never recomputed afterwards.
- **FR-031**: The record MUST name the scopes the run spanned, and whether that was every scope or a subset.
- **FR-032**: The record MUST name the input gaps the run was started with:
  - **FR-032a**: Groups excluded from planning.
  - **FR-032b**: Teams with no matched wish, or whose wish lacks game day, gym, or start time.
  - **FR-032c**: Gym capacities missing, or stored below what the wishes require.
- **FR-033**: A team whose parsed wish carries no game week A/B preference MUST NOT count as a gap. Absence of an A/B preference is a legitimate value, not missing data.
- **FR-034**: A run with any subset of scopes or any input gap MUST be marked incomplete. A run spanning every scope with no gaps MUST NOT be.
- **FR-035**: The incomplete marking MUST apply to single-scope runs as well as combined ones. A single-scope run with excluded groups is incomplete by the same rule. (This settles feature 005's Q4.)
- **FR-036**: An incomplete run MUST be distinguishable from a complete one wherever runs or snapshots are listed, without opening either.
- **FR-037**: Opening an incomplete run's snapshot MUST show what was missing, not merely that something was.
- **FR-038**: The record MUST describe what the run saw when it started, and MUST NOT be updated when the underlying data later changes. A run that was incomplete stays incomplete, even once the gaps are filled.

#### Combined results

- **FR-020**: A snapshot produced by a combined run MUST state which scopes it covers, and MUST NOT be presented as belonging to a single scope.
- **FR-021**: A combined snapshot MUST be distinguishable from a single-scope snapshot wherever snapshots are listed, without opening either. This is distinct from FR-036: that marks incomplete runs, this marks combined ones. A run spanning every scope with no gaps is complete and combined, and both facts matter — the first says it can be trusted, the second says what it is a plan *of*.
- **FR-022**: A scheduler MUST be able to narrow a combined snapshot's assignments and conflicts to one spanned scope without leaving the snapshot.

#### Readiness overview

- **FR-001**: The system MUST show, for a season, the input completeness of every scope the user can access.
- **FR-002**: A scope counts as complete when every group and team is known, every team has a matched wish carrying game day, gym and start time, and every implied gym capacity is stored and not below what the wishes require. This is the same standard a single-scope run already meets — and it is now informational, not a gate.
- **FR-004**: For each incomplete scope, the overview MUST name what is unmet.
- **FR-005**: The overview MUST let a user reach an incomplete scope's guided flow at the step that resolves the gap.
- **FR-006**: The overview MUST reflect source changes without requiring the user to re-derive completeness by hand.
- **FR-007**: Users MUST see readiness only for scopes they can access, and the overview MUST NOT imply anything about scopes they cannot see.

### Key Entities

- **Combined input set**: An input set spanning several scopes for a season rather than one. New; the current model cannot express it. The set of spanned scopes is chosen, not fixed.
- **Coverage record**: Per run, a persisted account of what it spanned and what it lacked, written at start and never revised. The feature's other new piece of state, and the one that makes incomplete runs safe to allow. Applies to single-scope runs too.
- **Scope readiness**: Per scope and season, whether inputs are complete and what is unmet. Derived from live data, unlike the coverage record — readiness describes now, the record describes then.
- **Combined snapshot**: The result of a combined run. States which scopes it covers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can start a combined run over two Bezirke with incomplete data, without the system refusing, and without leaving the flow.
- **SC-002**: No incomplete run can be mistaken for a complete one — in a snapshot list, in a run list, or on opening the snapshot itself.
- **SC-003**: For any incomplete run, an admin can identify what it did not see without consulting anything outside the run.
- **SC-004**: A combined run's plan for any spanned scope is never constrained by an upper-league Rasterzahl decided in an earlier separate run.
- **SC-005**: A run's coverage record still describes what it saw at the time, after the underlying data has changed.
- **SC-006**: Single-scope planning produces identical results before and after this feature exists, save for gaining a coverage record.
- **SC-010**: A scheduler scanning a snapshot list can tell a combined snapshot from a single-scope one, and separately can tell an incomplete run from a complete one, without opening either.
- **SC-007**: No user sees readiness for, or includes in a combined selection, a scope they cannot access.
- **SC-008**: An admin can determine the solver's practical limit by adding scopes to a combined selection until runs stop completing acceptably — without a separate spike.
- **SC-009**: For any incomplete scope, an admin can identify what is missing and reach the step that fixes it in one interaction.

## Assumptions

- The combined selection is a chosen subset of scopes, from two up to all of them. Spanning everything is the complete case, not a distinct mode — so the all-WTTV run needs no separate machinery.
- Incomplete runs are wanted, not tolerated. Running the optimizer with deliberately incomplete constraints is how it gets exercised, so refusing them would remove the feature's near-term value.
- What makes a run incomplete is measured against the standard a single-scope run already meets. Gym capacity "being there" means stored and not below what the wishes require; there is no reviewed/confirmed flag on a capacity today and this feature does not add one.
- Game week A/B is fidelity, not a gap: carried through when a source specifies it, and its absence is a real answer.
- Combined runs are additive. Single-scope planning keeps working unchanged, and a combined run does not supersede single-scope snapshots. Which plan is authoritative is an operational decision, not a system one.
- The coverage record is written once, at run start, and never revised. A run that saw gaps saw gaps, regardless of what is true later. This is what makes an old snapshot honest rather than retroactively flattering.
- The existing optimizer is reused for combined runs, as for single-scope runs. This feature does not reimplement the solver. Whether it absorbs the full ~1,400-team problem is unestablished — but subset runs make that discoverable rather than a matter for a spike (Q1).
- Fixed schedule numbers remain optional for a combined run, as for a single-scope run.
- The guided flow, scope keying, and scope reference from feature 005 exist before this feature is built.
- Scope access rules, roles, and audit behaviour carry over unchanged.

## Out of Scope

- Any change to the guided navigation itself (feature 005), beyond adding the coverage record to single-scope runs (FR-035).
- Fuzzy club/team match scoring, confidence display, and persisted aliases (tasks T079-T082 in `specs/003-raster-review-webapp/`).
- Changing what the optimizer optimizes for. This feature changes which decisions are the optimizer's to make, not the objective it pursues.
- Any change to import parsers or source formats.
- Automating the organizational work of getting 13 Bezirke to complete their data. This feature reports on it; it does not chase it.
- Deciding which plan wins when a combined snapshot and a single-scope snapshot disagree. Operational convention (Q3).
- Any run-time limit change. A combined run's acceptable wall-clock is Q2 and interacts with the solver question.

## Open Questions

- **Q1 (no longer blocking — now answered by using the feature)**: Can the existing CP-SAT optimizer solve the full combined problem in acceptable time? The Verband plus 13 Bezirke is roughly 1,400 clubs/teams versus hundreds for one Bezirk, and unfixing the upper-league Rasterzahlen (FR-013) adds freedom rather than removing it, so it is not a linear scale-up. **Previously this blocked the feature and wanted a spike.** With subset runs it does not: start with two Bezirke and add more until runs stop completing acceptably (SC-008). The answer arrives as evidence rather than as a guess, and if the full problem proves intractable the feature still delivers everything short of it. The reshape converted this from a risk into a measurement.
- **Q2 (open, decide at planning)**: What wall-clock limit should a combined run take? Single-scope runs default to 300 seconds. A three-Bezirk run plausibly wants more, and the honest answer depends on Q1's evidence. Planning should decide whether the limit is per-run configurable or a new default.
- **Q3 (open, low)**: When a combined snapshot and a single-scope snapshot disagree about a team, which is authoritative? Assumed operational convention rather than something the system decides (see Assumptions and Out of Scope). Worth confirming, but the coverage record means the incomplete one is at least identifiable, which is the part that would actually hurt.
- **Q4 (open, decide at planning)**: Should the coverage record be retrofitted onto runs that already exist when this ships, or only apply to new runs? Retrofitting means inventing a record for a run whose inputs are no longer knowable — which contradicts FR-038. Leaving old runs unmarked means they are indistinguishable from complete ones, which is the hazard this feature exists to remove. There is no production data today, so the cheap answer is to ensure none survives; that should be verified rather than assumed.
