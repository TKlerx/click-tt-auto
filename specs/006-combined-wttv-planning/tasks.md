# Tasks: Combined WTTV Planning

**Input**: Design documents from `/specs/006-combined-wttv-planning/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/combined-runs.md, quickstart.md

**Tests**: Not a TDD pass. Test tasks appear only where a requirement cannot be enforced otherwise — chiefly FR-038 (coverage frozen at run start) and FR-034 (`complete` requires both halves), which research R-103 identifies as invisible to any test where data has not changed.

**Organization**: Grouped by user story. User Stories 1 and 2 are **both P1 and ship together** — a subset run without a coverage record is the failure mode this feature exists to prevent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3, US4 per spec.md
- All paths repo-relative; this feature lives entirely under `webapp/`

---

## Phase 1: Setup

- [x] T001 Verify `RasterOptimizationRun` is empty across every environment before any schema work (data-model.md, spec Q4). Existing runs cannot honestly be given a coverage record — FR-038 requires it to describe what the run saw, which is no longer knowable. If rows exist, STOP and reconsider rather than invent history.
- [x] T002 Confirm feature 005 has landed: `RasterInputSet.scopeId` exists, and `RasterSnapshot.district` has been rekeyed to a scope reference (research R-104). If 005 shipped without the snapshot rekey, do it here first — but note it belongs in 005, and shipping without it releases a schema still carrying a scope-shaped string.
- [x] T003 [P] Add next-intl keys for the combined selection, the readiness overview, and the incomplete marking in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.

**Checkpoint**: T001 gates everything.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Add `RasterInputSetScope` to `webapp/prisma/schema.postgres.prisma` per data-model.md: `inputSetId` FK (Cascade), `scopeId` FK (Restrict), `@@unique([inputSetId, scopeId])`, `@@index([scopeId])`. Do **not** make `RasterInputSet.scopeId` nullable — 005's design deliberately allows a spanning row alongside an owning scope, and a null key pushes a branch through every existing query (research R-101).
- [x] T005 Add coverage columns to `RasterOptimizationRun` in `webapp/prisma/schema.postgres.prisma`: `coverageComplete Boolean`, `coverageJson String @default("{}")`, `@@index([coverageComplete])`. The index is not optional — FR-036 requires filtering lists by it.
- [x] T006 Add `RasterSnapshotScope` to `webapp/prisma/schema.postgres.prisma`: `snapshotId` FK (Cascade), `scopeId` FK (Restrict), `@@unique([snapshotId, scopeId])` (FR-020).
- [x] T007 Generate the migration in `webapp/prisma/migrations-postgres/` and regenerate the Prisma client.
- [x] T008 Create `webapp/src/services/raster/combinedInputSets.ts`: create a combined input set spanning ≥ 2 scopes. Refuse a single-scope selection — that is the normal flow wearing a costume (spec edge case). Refuse any scope the caller cannot access (FR-015), server-side regardless of what the picker offered. The owning `scopeId` must be among the spanned scopes.

**Checkpoint**: a combined input set can be created and rejects the cases it must.

---

## Phase 3: User Stories 1 + 2 - Subset runs, and knowing what they missed (Priority: P1) 🎯 MVP

**Goal**: Run any subset of scopes together with incomplete inputs allowed, and record what each run did not see.

**Independent Test**: Select two Bezirke, one with excluded groups and missing wishes. Start a combined run. Verify it starts, is not refused, produces one snapshot covering both, marked incomplete and naming the gaps, with upper-league Rasterzahlen assigned rather than inherited. Then fill the gaps and verify the old run's record is unchanged.

**Why these are one phase**: shipping US1 without US2 produces snapshots indistinguishable from finished plans that silently omit scopes. That is worse than shipping neither.

### Tests for User Stories 1 + 2

> These enforce properties nothing else can. Write them first.

- [x] T009 [P] [US2] Unit-test coverage freezing in `webapp/tests/unit/raster/coverage-frozen.test.ts`: after a run is created, changing the input set's excluded groups, wishes or capacities leaves the run's `coverageJson` and `coverageComplete` untouched (FR-038, SC-005). This is the test that catches recompute-on-render, which passes every other test.
- [x] T010 [P] [US2] Unit-test `coverageComplete` in `webapp/tests/unit/raster/coverage-complete.test.ts`: true **only** when every scope was spanned **and** there were no gaps, including unresolved wish-import conflicts from 008 FR-009a. Assert explicitly that spanning every scope *with* gaps is false, and that a subset *without* gaps is false (FR-034). The likely bug is treating `complete` as a synonym for `spannedAll`.
- [x] T011 [P] [US2] Unit-test that a wish carrying no game week A/B preference produces no gap in `webapp/tests/unit/raster/coverage-ab.test.ts` (FR-033).

### Implementation

- [x] T012 [US2] Create `webapp/src/lib/raster/coverage.ts`: compute the record from spanned scopes, excluded groups (season model `groups[].planningStatus`), wish gaps (team missing a matched wish, or a wish lacking game day/gym/start time), capacity gaps (005's `blockingCount = missingCount + insufficientCount` rule), and unresolved wish-import conflicts (`RasterWishConflict.decision = null`, 008 FR-009a). Per contracts/combined-runs.md.
- [x] T013 [US2] Freeze the record in `webapp/src/services/raster/runs.ts`, in the same transaction that creates the run (FR-030, FR-038). **Exactly one caller.** No other code path may write or recompute these columns — coverage describes *then*, readiness describes *now*, and they must never share a code path.
- [x] T014 [US2] Write the coverage record for **single-scope** runs too, not only combined ones (FR-035). A Bezirk run with excluded groups is incomplete by the same rule. This is what settles feature 005's Q4 — scoping coverage to combined runs would leave 005's partial runs unmarked.
- [x] T015 [US1] Assemble a multi-scope solver input in `webapp/src/lib/raster/solver-io.ts`: groups, teams, wishes and capacities across every spanned scope, with fixed upper-league Rasterzahlen **omitted** unless an admin supplied them (FR-013, FR-014). No solver change — `003` line 37 already establishes it accepts zero fixed numbers.
- [x] T016 [US1] Create `webapp/src/app/api/raster/combined/route.ts` (`POST`): create a combined input set from a scope set + season (FR-011). Rejects fewer than two scopes and any inaccessible scope (FR-015).
- [x] T017 [US1] Create `webapp/src/app/api/raster/combined/[id]/runs/route.ts` (`POST`): start a combined run, freezing coverage in the same transaction. **Must not reject for incompleteness** (FR-012) — and must not grow a `force` flag, because there is nothing to force past.
- [x] T018 [US1] Create `webapp/src/app/(dashboard)/raster/combined/page.tsx`: scope multi-select over accessible scopes, from two up to all (FR-010, FR-010a).
- [x] T019 [US1] Show the gaps the run will be started with, before starting, in `webapp/src/components/raster/combined/gap-summary.tsx` (FR-012a). This is what makes incompleteness a choice rather than an accident.
- [x] T020 [P] [US2] Create `webapp/src/components/raster/coverage/incomplete-badge.tsx` and render it in run and snapshot lists so incomplete runs are distinguishable without opening them (FR-036).
- [x] T021 [P] [US2] Create `webapp/src/components/raster/coverage/coverage-detail.tsx`: what was missing, not merely that something was (FR-037).
- [x] T022 [US1] Warn that a queued or running combined run may no longer reflect current sources when any spanned scope's sources change (FR-016).
- [x] T023 [US1] Name the spanned scope whose constraints could not be satisfied when a combined run is infeasible (FR-019), in `webapp/src/lib/raster/run-outcome.ts`.
- [x] T024 [US1] Ensure combined runs are processed asynchronously and observed exactly as single-scope runs are (FR-018) — reuse the existing run pipeline rather than building a parallel one.
- [x] T025 [P] [US1] Integration-test subset runs in `webapp/tests/integration/raster-combined-run.test.ts`: a two-Bezirk selection with gaps starts and is not refused (SC-001, FR-012); a single-scope selection is refused; a scope the caller cannot access cannot be included (SC-007, FR-015).
- [x] T026 [P] [US1] Integration-test that a combined run's plan is not constrained by upper-league Rasterzahlen from an earlier separate run (SC-004, FR-013), in `webapp/tests/integration/raster-combined-upper-league.test.ts`.

**Checkpoint**: subset runs work, and none of them can be mistaken for a finished plan.

---

## Phase 4: User Story 3 - Review a combined result scope by scope (Priority: P2)

**Goal**: A combined snapshot is reviewable one scope at a time and says which scopes it covers.

**Independent Test**: Open a combined snapshot spanning three Bezirke; narrow assignments and conflicts to each in turn.

- [x] T027 [US3] Populate `RasterSnapshotScope` when a combined run produces a snapshot, and state the covered scopes on the snapshot rather than presenting it as belonging to one (FR-020).
- [x] T027a [US3] Mark combined snapshots as combined wherever snapshots are listed, so they are distinguishable from single-scope ones without opening either (FR-021). This is **not** the incomplete badge (T020): a run spanning every scope with no gaps is complete *and* combined, and both facts matter — one says the plan can be trusted, the other says what it is a plan of. Two independent markers.
- [x] T028 [US3] Add scope narrowing to `webapp/src/app/(dashboard)/raster/snapshots/[id]/page.tsx`: filter assignments and conflicts to one spanned scope without leaving the snapshot (FR-022). Filter via the teams' scopes rather than storing scope on each assignment row (data-model.md).
- [x] T029 [US3] Verify single-scope snapshots remain unchanged and reviewable alongside combined ones, and that single-scope planning behaves identically to before this feature save for gaining a coverage record (FR-017, SC-006).
- [x] T030 [P] [US3] E2E-test the combined review in `webapp/tests/e2e/raster-combined-review.spec.ts`: a combined snapshot narrows per scope; a combined snapshot is distinguishable from a single-scope one in a list; an incomplete run is distinguishable from a complete one; and the two markings are independent — a complete combined snapshot shows as combined and not as incomplete (SC-002, SC-010).

**Checkpoint**: combined results are reviewable the way a scheduler actually works — one Bezirk at a time.

---

## Phase 5: User Story 4 - See which scopes are ready (Priority: P3)

**Goal**: A cross-scope readiness overview for chasing Bezirke and choosing what to combine.

**Independent Test**: With scopes at different completeness levels, verify each state and its missing items. No run started.

- [x] T031 [US4] Create `webapp/src/lib/raster/readiness-across-scopes.ts`, aggregating feature 005's per-scope `readiness.ts` (FR-001, FR-002). Compose it — do not restate its rules. If 005's readiness is right, this is an aggregation.
- [x] T032 [US4] Create `webapp/src/app/api/raster/readiness/route.ts` (`GET`): per-scope completeness across accessible scopes only. An absent scope is absent, not complete (FR-007).
- [x] T033 [US4] Create `webapp/src/app/(dashboard)/raster/readiness/page.tsx`: name what is unmet per incomplete scope (FR-004), reflecting source changes without manual re-derivation (FR-006).
- [x] T034 [US4] Link each incomplete scope to its guided flow at the step that resolves the gap (FR-005, SC-009).
- [x] T035 [P] [US4] Integration-test readiness access in `webapp/tests/integration/raster-readiness-access.test.ts`: a user sees only accessible scopes, and the overview implies nothing about the rest (FR-007).

**Checkpoint**: all four stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T036 Keep the existing 300-second default run limit and leave it per-run configurable via the existing `RunSettingsFields` (spec Q2, research R-106). Do not decree a combined default — the honest answer awaits Q1's evidence.
- [x] T037 [P] Update `specs/005-raster-guided-navigation/research.md` R-008 and spec Q4 to point at FR-030–FR-038 here. R-008 currently records the question as declined with residual risk standing; FR-035 closes it, so that text goes stale the moment this lands.
- [x] T038 [P] Walk `specs/006-combined-wttv-planning/quickstart.md` § "Verification against success criteria" end to end.
- [x] T039 Run `webapp/validate.ps1` (typecheck + lint) — constitution Principle VI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 gates everything; T002 gates on feature 005 having landed.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all stories.
- **US1+US2 (Phase 3)**: The MVP. One phase, not two.
- **US3 (Phase 4)**: Needs Phase 3 producing combined snapshots to review.
- **US4 (Phase 5)**: Needs 005's per-scope readiness. Independent of Phases 3-4.
- **Polish (Phase 6)**: After the desired stories.

### Feature dependency

This feature depends on **005** for the scope-keyed input set and the guided flow. T002 checks it. Building on `main` or on 004 will not work — `RasterInputSet.scopeId` will not exist.

### Within Phase 3

- T009–T011 (tests) before T012–T014. They are the only enforcement of FR-038 and FR-034.
- T012 (coverage computation) before T013 (freezing) before T014 (single-scope coverage).
- T016 (create) before T017 (run).

### Parallel Opportunities

- T003 with anything in Phase 1.
- T009, T010, T011 — three independent unit tests.
- T020, T021 — badge and detail are separate components.
- T025, T026, T030, T035 — tests across different files.
- Phase 5 (US4) can proceed in parallel with Phases 3-4 by another developer — it touches no coverage code.

---

## Parallel Example: User Stories 1 + 2

```bash
# The three enforcement tests are independent and come first:
Task: "Unit-test coverage freezing in webapp/tests/unit/raster/coverage-frozen.test.ts"
Task: "Unit-test coverageComplete in webapp/tests/unit/raster/coverage-complete.test.ts"
Task: "Unit-test A/B absence is not a gap in webapp/tests/unit/raster/coverage-ab.test.ts"
```

---

## Implementation Strategy

### MVP (Phases 1-3)

Subset runs plus the coverage record. Delivers what was asked for: run two Bezirke together today, with gaps, and know exactly what the run did not see.

**STOP and VALIDATE** against SC-001, SC-002, SC-003, SC-005.

### Then

1. US3 → combined results reviewable per scope.
2. US4 → readiness overview.

### How Q1 gets answered

Not by a spike. Once Phase 3 ships: two Bezirke, then three, then five, until runs stop completing acceptably (SC-008). The reshape turned the solver risk into a measurement — take the measurement rather than estimating.

---

## Notes

- **The coverage record is the safety mechanism**, not a reporting nicety. FR-012 removes a refusal; FR-034 is what keeps constitution Principle II intact. Shipping US1 without US2 would be a genuine violation, not a partial delivery.
- **T013's "exactly one caller" is load-bearing.** Recompute-on-render passes every test where data has not changed and silently rewrites history when it has. T009 is the only thing that catches it.
- **T014 is what settles 005's Q4.** Coverage is not combined-only.
- **T002 is a real dependency, not a formality.** This cannot be built before 005.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.
