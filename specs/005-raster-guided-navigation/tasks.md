# Tasks: Guided Raster Navigation

**Input**: Design documents from `/specs/005-raster-guided-navigation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/raster-steps.md, quickstart.md

**Tests**: Not a TDD pass. Test tasks appear only where a requirement is otherwise unenforceable — chiefly FR-010a (an identical re-parse must change nothing), which research R-004 identifies as verifiable only by unit-testing the fingerprint directly.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to a user story from spec.md (US1, US2, US3)
- All paths are repo-relative; this feature lives entirely under `webapp/`

---

## Phase 1: Setup

**Purpose**: Preconditions. No project initialisation — the app exists and this feature adds no dependency.

- [x] T001 Verify Raster data is discardable before any schema work: query for `RasterHallCapacity` rows with `basis = REVIEWED` and any `RasterReviewDecision` rows against every environment. If either returns rows, STOP — FR-024's premise has expired and the spec's load-bearing assumption needs revisiting. Record the result in `specs/005-raster-guided-navigation/research.md` under R-006.
- [x] T002 [P] Add next-intl keys for the four step names and the scope levels "Bezirk"/"Verband" in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`. Level names are proper nouns carried unchanged across all five locales (FR-022a).

**Checkpoint**: T001 must pass before Phase 2. It is the only task here that can prevent unrecoverable data loss.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Scope keying and shared derivations. Every user story depends on this.

**⚠️ CRITICAL**: No user story work begins until this phase completes.

- [x] T003 Replace `RasterInputSet.district: String` with a required `scopeId` FK to `Scope` (relation `onDelete: Restrict`), swap `@@index([district, season, createdAt])` for `@@index([scopeId, season, createdAt])`, in `webapp/prisma/schema.postgres.prisma`. Add NO unique constraint on `(scopeId, season)` — it would foreclose feature 006's spanning input set (FR-026, data-model.md).
- [x] T004 Replace `RasterHallCapacity.district: String` with a required `scopeId` FK to `Scope`, swap `@@unique([district, clubId, hall, weekday])` for `@@unique([scopeId, clubId, hall, weekday])` and `@@index([district, clubId])` for `@@index([scopeId, clubId])`, in `webapp/prisma/schema.postgres.prisma`.
- [x] T004a Replace `RasterSnapshot.district: String` with a required `scopeId` FK to `Scope`, and swap `@@index([district, createdAt])` for `@@index([scopeId, createdAt])`, in `webapp/prisma/schema.postgres.prisma`. This is the **third** carrier of the scope-shaped string and was missed in the original plan (found while planning feature 006 — see its research R-104). Rekeying two of three leaves the third to drift, which is the very argument R-003 used to include hall capacities. Feature 006 adds a spanned-scope set on top; that is additive and does not change the shape here.
- [x] T005 Generate the drop-and-recreate migration in `webapp/prisma/migrations-postgres/` (no data conversion, per FR-024) and regenerate the Prisma client. It must cover all three rekeys (T003, T004, T004a) so `district` leaves the schema in one step.
- [x] T006 [P] Create `webapp/src/lib/raster/scope-level.ts`: derive Bezirk/Verband from hierarchy position (parent is root `DE` → Verband; grandparent is root → Bezirk). Do not store a level column (research R-005).
- [x] T007 Rewrite scope resolution in `webapp/src/lib/raster/access.ts` to match `Scope.code` only. Delete the `code`-or-`name` match in `canAccessRasterDistrict` — it is what allowed `district` to hold `WTTV` unnoticed. Leave the ancestor walk alone; narrowing it is feature 007's job, not this one's.
- [x] T008 Constrain the scope selector source to Bezirke and the Verband, excluding the Germany root, in `webapp/src/lib/raster/access.ts` (`listAccessibleRasterScopes`) (FR-023).
- [x] T009 Update the twelve services in `webapp/src/services/raster/` to take `scopeId` instead of a `district` string. Signatures and callers only — do not rewrite service logic.
- [x] T010 Update every raster API route under `webapp/src/app/api/raster/` to accept a `scope` code instead of `district` and resolve it to a `scopeId`. Remove `district`; no dual-accept period (contracts/raster-steps.md).
- [x] T011 Create `webapp/src/lib/raster/readiness.ts` deriving per-step state from existing signals: sources present, group planning status and wish completeness (season model JSON), `reviewHallCapacitiesForInputSet` (`blockingCount = missingCount + insufficientCount`), `RasterInputSet.status`, finished runs. Shape must carry `hasExclusions` **alongside** `state`, not folded into it — a four-value enum cannot say "ready, but three groups are excluded" (FR-011a, contracts/raster-steps.md). US2 adds match-review as a further input.
- [x] T012 [P] Update `webapp/prisma/seed.ts` to seed input sets and hall capacities by `scopeId`.
- [x] T013 [P] Unit-test `scope-level.ts` for Bezirk, Verband, and root classification in `webapp/tests/unit/raster/scope-level.test.ts`.
- [x] T013a Preserve ancestor source resolution through the keying change in `webapp/src/services/raster/sources.ts` (`listRasterSourcesForDistrict` and callers): an input set MUST still consume sources from its own scope **and its ancestors** (FR-025). This is where inheritance silently drops when a `district` string becomes a `scopeId` — a Bezirk input set that stops seeing WTTV-level sources looks like missing data, not like a bug.
- [x] T013b [P] Integration-test ancestor source inheritance in `webapp/tests/integration/raster-source-scope-inheritance.test.ts`: a Bezirk input set lists sources owned by WTTV and by Germany; a Bezirk input set does not list a sibling Bezirk's sources (FR-025).

**Checkpoint**: An input set can be created for OWL and for WTTV; both are labelled by level; nothing says "District".

---

## Phase 3: User Story 1 - Follow a named workflow for a chosen scope and season (Priority: P1) 🎯 MVP

**Goal**: Four addressable steps behind a nested left nav, replacing the 571-line single page, keyed on scope + season.

**Independent Test**: Open Raster, select a Bezirk and season, verify four steps appear in a left nav, each showing only its own content, with every capability from the old page reachable from exactly one step. Repeat with the Verband selected.

### Implementation for User Story 1

- [x] T014 [US1] Replace the pass-through in `webapp/src/app/(dashboard)/raster/layout.tsx` with the Raster shell: scope/season picker plus the step nav, reading `searchParams`. It is a **secondary** nav inside the Raster content area — `DashboardLayout` already renders a fixed global sidebar at `md:pl-64`, so this nests rather than extends it (research R-002).
- [x] T014a [US1] Assert scope access on **every** step page before any step content is loaded, and return the existing not-authorized response otherwise (FR-016). Today `page.tsx` calls `assertRasterAccess(user, district, "viewer")` exactly **once**, at line 79, for the whole page; four step pages means four checks, and the one you forget silently serves another Bezirk's data. Prefer a single shared guard the step pages call, so the check cannot be omitted per page — a layout-level check alone is not sufficient, because a step page is directly addressable and renders on its own.
- [x] T014b [P] [US1] Integration-test scope authorization per step in `webapp/tests/integration/raster-step-access.test.ts`: for each of the four step routes, a user without access to the requested scope reaches no step content (FR-016); a user with access reaches it. Parameterise over the steps so a fifth step added later cannot skip the test.
- [x] T015 [P] [US1] Create the step nav component in `webapp/src/components/raster/nav/step-nav.tsx`: four steps in workflow order, every one reachable regardless of readiness (FR-013).
- [x] T016 [P] [US1] Create the scope/season picker in `webapp/src/components/raster/nav/scope-season-picker.tsx`, showing each scope's hierarchy position and naming its level Bezirk or Verband (FR-022, FR-022a). Never "District".
- [x] T017 [US1] Convert `webapp/src/app/(dashboard)/raster/page.tsx` from the 571-line page into a redirect resolving the default step: first step in workflow order with outstanding work, falling through to `runs` when nothing is outstanding, derived from `readiness.ts` rather than any remembered preference (FR-004a, FR-004b).
- [x] T018 [P] [US1] Create `webapp/src/app/(dashboard)/raster/import/page.tsx`: sources add/refresh/remove plus input set creation. Move `RasterSourcesPanel` and `CreateInputSetForm` here unchanged (FR-005).
- [x] T019 [P] [US1] Create `webapp/src/app/(dashboard)/raster/review/page.tsx`: move `GroupPlanningReview`, `GroupModeReview`, `ModelWarnings`, `CapacityTable`, `InferCapacitiesButton`, `CapacityWizard` and `FixedScheduleNumbersForm` here unchanged (FR-006).
- [x] T020 [P] [US1] Create `webapp/src/app/(dashboard)/raster/run/page.tsx`: move validation, `RunSettingsFields`, run start and `RunPhaseBar` from `InputSetRunActions` here. `InputSetRunActions` currently mixes run controls with `CapacityWizard` — the capacity half belongs in Review data (T019), the run half here (FR-007).
- [x] T021 [P] [US1] Create `webapp/src/app/(dashboard)/raster/runs/page.tsx`: finished run outcomes, snapshot links and `ScenarioComparison` (FR-008). The snapshot detail view stays a destination, not a step.
- [x] T022 [US1] Resolve the flow to a single input set per scope and season, with no input-set selector anywhere (FR-006a). Where several exist, Import data is where one is created or picked.
- [x] T023 [US1] Render empty states for steps with nothing to act on, rather than errors, across all four step pages.
- [x] T024 [US1] Move the seven hardcoded `Role.PLATFORM_ADMIN` checks from the old `page.tsx` into their new step pages **unchanged**. They are wrong — `access.ts` already defines a `scheduler` level including `SCOPE_ADMIN` — but fixing them is feature 007's FR-017. Do not widen access here.
- [x] T024a [US1] Verify a view-only user sees all four steps with their content and no edit, import, or run controls (FR-015). This is the observable half of T024: moving the checks preserves the behaviour, this confirms it survived the move across four pages instead of one.
- [x] T025 [US1] Delete the now-dead helpers from the old `page.tsx` (`extractPlanningGroups`, `wishCandidatesForTeam`, `selectedWishForTeam`, `similarity`, `normalizeMatchText`, `formatWishFields`, `missingWishFields`, `extractManualAssignmentTeams`, `extractModelWarnings`, `extractSixTeamGroups`) after relocating them to whichever step page owns them.
- [x] T026 [P] [US1] Integration-test step routing in `webapp/tests/integration/raster-step-routing.test.ts`: reload and shared links restore step + scope + season (FR-004); switching step preserves scope/season and vice versa (FR-003).

**Checkpoint**: Every capability from the old page is reachable from exactly one step (SC-005). Step URLs survive reload and sharing (FR-004).

---

## Phase 4: User Story 2 - Review source-to-model matching once, in Review data (Priority: P2)

**Goal**: The matching review lives in Review data and stays settled per record until that record's source content actually changes.

**Independent Test**: Import a source, complete the matching review in Review data, go to Run optimizer and start a run — no re-review. Re-upload one club's PDF with a change and verify only that club goes outstanding.

### Tests for User Story 2

> These enforce FR-010a, which nothing else can.

- [x] T027 [P] [US2] Unit-test the fingerprint in `webapp/tests/unit/raster/match-review-fingerprint.test.ts`: identical parsed data yields an identical fingerprint (FR-010a); whitespace, diacritic and ordering churn do not change it; a changed `wishMatchId`, `homeWeekday`, `hall`, `startTime` or `spielwochePref` does.

### Implementation for User Story 2

- [x] T028 [US2] Add `RasterMatchReview` and the `RasterMatchRecordType` enum (`TEAM`) to `webapp/prisma/schema.postgres.prisma` per data-model.md, with `@@unique([inputSetId, recordType, recordId])`, and generate the migration.
- [x] T029 [US2] Create `webapp/src/lib/raster/match-review.ts`: fingerprint over **normalised** reviewed fields — matched wish identity, `homeWeekday`, `hall`, `startTime`, `spielwochePref`, resolved club/team identity. Reuse the existing NFKD/diacritic-strip/lowercase normalisation. Fingerprinting raw text re-opens reviews on whitespace churn, failing FR-010a in practice while passing it in theory (research R-004).
- [x] T030 [US2] Add `outstanding` derivation to `match-review.ts`: no review row, or current fingerprint differs from the stored one. Never persist this — it is a comparison against live parsed data.
- [x] T031 [US2] Create `webapp/src/app/api/raster/input-sets/[id]/match-review/route.ts` with `POST` (mark records reviewed, storing current fingerprints — FR-009) and `GET` (per-record state: settled, or outstanding with reason — FR-010b). Re-posting an unchanged record is a no-op (FR-010a). Gate at the `admin` level the group route already uses; do not widen it.
- [x] T032 [US2] Render the matching review in `webapp/src/app/(dashboard)/raster/review/page.tsx`, marking exactly which records are outstanding so only those are re-reviewed rather than the whole set (FR-010b).
- [x] T033 [US2] Remove the matching review from `webapp/src/app/(dashboard)/raster/run/page.tsx` entirely — Run optimizer must not present it (FR-007).
- [x] T034 [US2] Feed match-review state into `webapp/src/lib/raster/readiness.ts` as a Review data signal.
- [x] T035 [P] [US2] Integration-test invalidation in `webapp/tests/integration/raster-match-review.test.ts`: review once then start three runs without re-review (SC-003); refresh one club's source with changed data and verify only that club is outstanding and no other club is (SC-004).

**Checkpoint**: Review once, run repeatedly. One club's PDF no longer re-opens a whole Bezirk.

---

## Phase 5: User Story 3 - See which steps are done and what blocks the next one (Priority: P3)

**Goal**: The nav shows per-step readiness and names what blocks the next step — and never lets an excluded group read as settled.

**Independent Test**: With gym capacities missing, verify Run optimizer shows as blocked pointing at Review data, and that resolving them clears it. Separately, exclude a group whose wishes are missing and verify it stops blocking while remaining visible as deferred.

### Implementation for User Story 3

- [x] T036 [US3] Render per-step readiness in `webapp/src/components/raster/nav/step-nav.tsx`: not started, outstanding work, ready, blocked (FR-011).
- [x] T037 [US3] Render blocked reasons with the step that resolves them (FR-012), mapping the existing gates from contracts/raster-steps.md: validation not passed → Run optimizer; capacities missing or below requirement → Review data; six-team group without a mode → Review data; matching review outstanding → Review data. These gates keep holding regardless of navigation (FR-014).
- [x] T038 [US3] Surface `hasExclusions` throughout the nav: never show an unqualified ready state, and never present a scope as fully planned, while any group is excluded (FR-011a, FR-006e). An excluded group is deferred work, not settled work.
- [x] T039 [US3] Present group exclusion in `webapp/src/app/(dashboard)/raster/review/page.tsx` as a way to proceed while wishes are outstanding, not as a resolution to them (FR-006c). The API already exists — `/api/raster/input-sets/[id]/groups/[groupId]` accepts `planningStatus` and delegates to `updateGroupPlanningStatus`. This is presentation, not new capability.
- [x] T040 [US3] Include "exclude this group to proceed for now" among the stated options wherever outstanding work is a group's missing wishes (FR-012a), alongside supplying the data.
- [x] T041 [US3] Surface that an excluded group can now be included once its wishes arrive, rather than leaving the exclusion silently in place (FR-006f).
- [x] T042 [US3] Present a run covering every group as the goal and a run with exclusions as provisional (FR-006g), in `webapp/src/app/(dashboard)/raster/run/page.tsx`.
- [x] T043 [US3] Keep excluded groups visible as excluded rather than hidden in Review data (FR-006b).
- [x] T044 [P] [US3] Unit-test readiness in `webapp/tests/unit/raster/readiness.test.ts`: blocked reasons map to the resolving step; `hasExclusions` is never collapsed into `ready`; the default step resolves to the first outstanding step and falls through to `runs`; an excluded group contributes no blocking reason and no outstanding gap (FR-006d).
- [x] T045 [P] [US3] E2E-test the guided flow in `webapp/tests/e2e/raster-guided-flow.spec.ts`: a Bezirk with excluded groups never reads as fully planned (SC-013); wishes arrive and the groups can be included without hunting (SC-014).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T046 Fix the mislabelled audit action in `webapp/src/app/api/raster/input-sets/[id]/groups/[groupId]/route.ts`: planning-status changes are audited as `AuditAction.RASTER_INPUT_UPLOADED`, which is not what happened. Excluding a group is a planning decision and is the difference between a complete and a partial Bezirk — it should be auditable as one. (Traces to no FR — a defect found while reading the group route. Kept because constitution Principle V requires actions to be logged with clear reasons, and this one is logged with a wrong reason.)
- [x] T047 [P] Verify no `district` string survives in **`webapp/prisma/schema.postgres.prisma`** or in `webapp/src/` outside migration history, and no user-facing "District" label survives in `webapp/src/i18n/messages/`. The schema is named explicitly because this task originally checked only `webapp/src/` — which is why `RasterSnapshot.district` went unnoticed until feature 006's planning found it.
- [x] T048 [P] Confirm each step loads only its own data — the old page eagerly loaded input sets, sources, scenarios, capacities _and_ ran a per-input-set capacity review on every render. Splitting should load strictly less per view. (Traces to plan.md Performance Goals rather than to an FR or SC; the spec sets no performance target.)
- [x] T049 Walk `specs/005-raster-guided-navigation/quickstart.md` § "Verification against success criteria" end to end.
- [x] T050 Run `webapp/validate.ps1` (typecheck + lint) — constitution Principle VI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 gates everything — it is the only check standing between this plan and unrecoverable data loss.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **User Stories (Phase 3-5)**: All depend on Foundational.
- **Polish (Phase 6)**: Depends on the desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories. The MVP.
- **US2 (P2)**: After Foundational. Needs US1's step pages to render into, so it is not fully independent of US1 in practice — its matching review must land in a Review data step that exists.
- **US3 (P3)**: After Foundational. Needs US1's nav to render readiness into. T034 (US2) enriches readiness, but US3 stands without it — the other gates are already derivable.

### Within Each Story

- Schema before services before routes before pages.
- T027 (fingerprint test) before T029 (fingerprint) — it is the requirement's only enforcement.
- T011 (readiness) before T017 (default-step redirect).

### Parallel Opportunities

- T006, T012, T013, T013b in Phase 2 — different files.
- T018–T021 — four independent step pages, one per developer.
- T015 and T016 — nav and picker are separate components.
- T014b, T026, T035, T044, T045 — tests across different files.

### Ordering constraints added after analysis

- T014a (per-step access guard) before T018–T021. Writing the step pages first and retrofitting the guard is how one gets missed.
- T013a (ancestor source resolution) alongside T009, not after — the inheritance drops the moment the signature changes.

---

## Parallel Example: User Story 1

```bash
# The four step pages are independent once the shell exists (T014):
Task: "Create import step page in webapp/src/app/(dashboard)/raster/import/page.tsx"
Task: "Create review step page in webapp/src/app/(dashboard)/raster/review/page.tsx"
Task: "Create run step page in webapp/src/app/(dashboard)/raster/run/page.tsx"
Task: "Create runs step page in webapp/src/app/(dashboard)/raster/runs/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup — T001 must pass.
2. Phase 2 Foundational — scope keying.
3. Phase 3 US1 — the four steps.
4. **STOP and VALIDATE** against SC-005 and FR-004.

At this point the backlog item's headline ask is delivered: the Raster page is a guided flow.

### Incremental Delivery

1. Setup + Foundational → scope keying done, Bezirk and Verband both plannable.
2. US1 → guided flow (MVP).
3. US2 → the matching review stops repeating.
4. US3 → the flow starts actually guiding.

---

## Notes

- **Move, do not rewrite.** The twelve services in `services/raster/` are fine. This feature re-composes callers. If you are rewriting a service, stop.
- **T024 is deliberate restraint.** The seven `PLATFORM_ADMIN` checks are wrong and feature 007 fixes them. Widening access here would silently ship a permissions change inside a navigation redesign.
- **T001 is not a formality.** Hand-`REVIEWED` gym capacities and review decisions are the only Raster data no reimport restores.
- **T014a is the finding from `/speckit.analyze`.** The old page checks scope access once, for the whole page. Four step pages means four checks, and each is independently addressable. This is the single most likely way this refactor ships a data leak.
- **The likeliest defect is a four-value readiness enum** (T011, T038). It cannot express "ready, but three groups are excluded", which FR-011a specifically forbids showing as ready.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.
