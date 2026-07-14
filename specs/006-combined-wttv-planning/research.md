# Phase 0 Research: Combined WTTV Planning

**Feature**: `006-combined-wttv-planning` | **Date**: 2026-07-14

IDs are numbered from R-101 to avoid collision with feature 005's R-001–R-008, which this feature builds directly on.

The specification carries no unresolved clarifications. The unknowns are technical: how an input set spans scopes without disturbing 005's key, where the coverage record lives, how a snapshot expresses covering several scopes, and what a combined run actually sends the solver.

---

## R-101: How does an input set span several scopes?

**Decision**: A `RasterInputSetScope` join table. The owning `scopeId` that feature 005 adds stays exactly as it is; a combined input set additionally carries a row per spanned scope.

**Rationale**: 005's FR-026 required its scope reference not to foreclose this, and its research R-003 chose the shape deliberately — a single `scopeId` FK, with the unique constraint on `(scopeId, season, name)` rather than `(scopeId, season)`, specifically so a spanning row could exist later. That worked: nothing needs undoing.

Keeping the owning `scopeId` matters beyond convenience. Every existing query filters input sets by scope; if a combined input set had no owning scope, each of those would need a null case. With an owning scope plus a spanned set, a combined input set still belongs somewhere sensible (the Verband, or the first chosen scope) and existing queries keep working.

**Alternatives considered**:
- *Nullable `scopeId` plus a set*: expresses "belongs to no single scope" more honestly, but forces a null branch through every existing query for a case that is not the common one.
- *A separate `RasterCombinedInputSet` entity*: clean separation, but duplicates wishes, capacities, fixed numbers and run relations — and FR-017 requires combined runs to behave like any other run, which a parallel entity works against.
- *Encode scopes in the season model JSON*: no migration, but unqueryable, so FR-036 ("distinguishable without opening") becomes impossible.

---

## R-102: Where does the coverage record live?

**Decision**: Two columns on `RasterOptimizationRun` — a queryable `coverageComplete` boolean and a `coverageJson` detail payload — written at run start.

**Rationale**: FR-036 requires incomplete runs to be distinguishable wherever runs or snapshots are listed *without opening them*, which rules out anything unqueryable. A boolean column indexes and filters; the detail payload answers FR-032 and FR-037 when someone does open it.

The run is the right home rather than the snapshot: FR-030 says *every run* carries the record, and a run that fails or proves infeasible produces no snapshot but still had coverage worth stating. Snapshots reach it via their existing `runId` relation.

A JSON payload for the detail is consistent with the model's existing habits — `settings`, `objectiveBreakdown`, `seasonModelJson` are all JSON strings — so this introduces no new pattern. The queryable half is exactly the boolean, which is all any list needs.

**Alternatives considered**:
- *A separate `RasterRunCoverage` table*: relationally tidier, but every run has exactly one, so it is a one-to-one join bought for nothing.
- *Everything inside the existing `settings` JSON*: no migration, but `settings` means "what the user asked for" and coverage means "what the run actually saw" — conflating them would make FR-038's immutability guarantee unstatable, since settings are the user's.
- *Derive coverage at read time*: cheapest, and wrong. FR-038 requires the record to describe what the run saw *then*; deriving it later describes now, which is precisely the retroactive flattery the requirement forbids.

---

## R-103: How is FR-038's immutability actually guaranteed?

**Decision**: Write the record once, in the same transaction that creates the run, and never update it. No code path may recompute it. Enforce by convention plus a test, since Prisma cannot express column immutability.

**Rationale**: This is the feature's most easily-lost property. The naive implementation recomputes coverage when rendering a run list — which looks identical in every test where data has not changed, and silently rewrites history the moment it has. A run started when three groups were excluded must still say so after the groups are included; otherwise an old snapshot becomes retroactively flattering and the record is worse than useless, because it is trusted and wrong.

The guard is a unit test asserting that changing the underlying input set after a run leaves the run's record untouched (spec SC-005), plus keeping the computation in one place (`lib/raster/coverage.ts`) called from exactly one caller (run creation).

**Alternatives considered**:
- *Database-level immutability (trigger)*: real enforcement, but introduces a trigger to a schema that has none, for one column pair.
- *Recompute and compare, warn on drift*: sounds diligent, but it means storing the answer and then not trusting it; the drift it would detect is the normal case (data changes after runs).

---

## R-104: How does a snapshot express covering several scopes?

**Decision**: Replace `RasterSnapshot.district: String` with a scope reference and a spanned-scope set, mirroring R-101's shape for input sets.

**Rationale**: `RasterSnapshot.district` is a third free-text scope-shaped string, alongside the two feature 005 rekeys (`RasterInputSet.district`, `RasterHallCapacity.district`). 005's research R-003 justified rekeying capacities because "leaving it as text while the input set moves to an FK would guarantee they drift" — that argument applies to snapshots identically, and 005's plan simply missed it. Its cleanup task (T047) checks `webapp/src/` and would not have caught a schema column.

This feature must touch it regardless: FR-020 requires a snapshot to state which scopes it covers, and a single string cannot hold several.

**Sequencing**: the rekey belongs in feature 005, with the other two, so all three move together and `district` leaves the schema in one step. The *spanned set* belongs here. If 005 ships without it, this feature does both — but that is the worse order, because it leaves a released schema with one scope-shaped string still in it, which is how the current `code`-or-`name` ambiguity survived as long as it did.

**Alternatives considered**:
- *Leave `district` as text on snapshots*: no migration, and preserves exactly the defect this line of work exists to remove.
- *Do the rekey here rather than in 005*: workable, but splits one schema change across two features for no benefit.

---

## R-105: What does a combined run send the solver?

**Decision**: One solver input covering every spanned scope, with fixed upper-league Rasterzahlen omitted unless an admin supplied them explicitly. No solver change.

**Rationale**: FR-013 requires upper-league Rasterzahlen to be decided by the run rather than supplied to it — which is not a new solver capability but the *absence* of an input. `003` settled this: "Fixed schedule numbers are optional. A full WTTV or district run may proceed with zero fixed numbers; the optimizer assigns schedule numbers subject to the available group, wish, and capacity inputs."

So the work is in `solver-io.ts`: assemble groups, teams, wishes and capacities across several scopes into the input the solver already accepts. FR-014 still honours explicitly-supplied fixed numbers, which is the same code path as today.

This keeps constitution Principle I intact — the solver is reused, not reimplemented.

**Alternatives considered**:
- *Run each scope separately and merge*: not the feature. The entire value (FR-013) is that the scopes are solved *together*, so upper-league decisions know their downstream cost.
- *Teach the solver about scopes*: unnecessary. Scope is an application concern; the solver sees groups, teams and capacities.

---

## R-106: Is the solver feasibility question (Q1) resolved here?

**Decision**: No, and deliberately not. This plan makes no performance claim above one Bezirk.

**Rationale**: Q1 asks whether CP-SAT absorbs ~1,400 clubs/teams with upper-league numbers unfixed. Before the clarify session this blocked the feature and wanted a spike. It no longer blocks anything: subset runs mean the limit is found by adding Bezirke until runs stop completing acceptably (SC-008).

Planning cannot answer it and should not pretend to. What planning *can* do is ensure the feature degrades honestly: a run that exceeds its limit or returns no proven optimum is already handled by the existing run outcome model (`FEASIBLE`, `INFEASIBLE`, solver status), and FR-019 requires an infeasible combined run to name the scope whose constraints could not be satisfied.

**Consequence for Q2** (wall-clock limit): also unanswerable in advance, for the same reason. The existing 300-second default should stay as the default and remain per-run configurable — `RunSettingsFields` already exposes a time limit — so the answer can be discovered rather than decreed.

---

## Resolved unknowns summary

| ID | Unknown | Decision |
|---|---|---|
| R-101 | Spanning input set | `RasterInputSetScope` join; 005's owning `scopeId` untouched |
| R-102 | Coverage record home | Queryable boolean + JSON detail on the run |
| R-103 | Immutability | Written once at run creation; one caller; test-enforced |
| R-104 | Snapshot scopes | Rekey `district` (belongs in 005) + spanned set (here) |
| R-105 | Solver input | One multi-scope input, fixed numbers omitted; no solver change |
| R-106 | Solver feasibility (Q1) | Not answered; made measurable instead |

**No NEEDS CLARIFICATION remain.** Spec Q1 is measured rather than resolved (R-106); Q2 defers to that measurement; Q3 is an operational convention; Q4 is handled in data-model.md.
