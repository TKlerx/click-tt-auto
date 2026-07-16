# Tasks: Wish Import Conflict Review

**Input**: Design documents from `/specs/008-wish-import-conflicts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/wish-imports.md, quickstart.md

**Tests**: Not a TDD pass. Test tasks appear where a requirement fails silently — chiefly FR-006 (correction survives a sync) and FR-004a (a decided value never re-raises), neither of which announces itself when broken.

**Organization**: Grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3 per spec.md
- All paths repo-relative; this feature lives entirely under `webapp/`

---

## Phase 1: Setup

- [x] T001 Verify no `RasterWish` rows violate the incoming `@@unique([inputSetId, clubId, teamLabel])`. There should be none — every current row came from one `createMany` over deduplicated parse output — but verify rather than assume (the reasoning feature 005's R-006 applied to its own migration). A migration that fails loudly on a constraint is safe; one that silently drops rows to satisfy it is not.
- [x] T002 [P] Add next-intl keys for the conflict review, decisions, unmatched rows and the missing-from-import marker in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Add `RasterWishOrigin`, `RasterWishImportKind`, `RasterConflictDecision` enums and the `RasterWishImportBatch`, `RasterImportedWishRow`, `RasterWishConflict` tables to `webapp/prisma/schema.postgres.prisma` per data-model.md.
- [x] T004 Add `origin`, `reviewedAt`, `reviewedById` to `RasterWish`, defaulting existing rows to `origin = IMPORTED` — everything currently there came from a parse. **`origin` is provenance, never permission** (FR-002a): the moment a rebuild consults it before overwriting, the "protect only edited rows" design the clarification rejected is back as a column.
- [x] T005 Add `@@unique([inputSetId, clubId, teamLabel])` to `RasterWish`. **`teamLabel` is nullable and PostgreSQL treats NULLs as distinct**, so two label-less wishes for one club would both pass — normalise absent labels to a sentinel before writing, or add a partial unique index. This passes every test until real data has a team with no label (data-model.md).
- [x] T006 Generate the migration and regenerate the Prisma client.
- [x] T007 Create `webapp/src/lib/raster/wish-identity.ts`: pair an imported row to an active wish. Use canonical team identity where feature 009's roster exists; `clubId` + `teamLabel` otherwise. **A row that pairs with nothing becomes an unmatched row, never a second active wish for a team that already has one** (FR-003a, research R-402).
- [x] T008 Create `webapp/src/lib/raster/wish-diff.ts`: compare an imported row against a wish on **normalised** values, and fingerprint the imported value. Reuse feature 005's normalisation (its R-004) — fingerprinting raw text makes whitespace churn a new value, which re-raises decided conflicts forever.

### Tests for the foundation

> These enforce what fails silently. Write them first.

- [x] T009 [P] Unit-test fingerprinting in `webapp/tests/unit/raster/wish-diff.test.ts`: identical parsed values fingerprint identically; whitespace and diacritic churn does not change it; a changed day, time, hall, week preference, requested number or notes does.
- [x] T010 [P] Unit-test pairing in `webapp/tests/unit/raster/wish-identity.test.ts`: an exact pair resolves; an unpairable row yields **unmatched**, not a new wish (FR-003a).

**Checkpoint**: the pieces that decide "is this the same wish, and did it change?" are correct before anything acts on them.

---

## Phase 3: User Story 1 - Review conflicting imports (Priority: P1) 🎯 MVP

**Goal**: An import proposes. An existing wish is never overwritten.

**Independent Test**: Correct a wish by hand, refresh the source, and verify **the correction survives** and a conflict is raised showing both values.

### Implementation

- [x] T011 [US1] **Delete `replaceParsedWishes`** (`webapp/src/services/raster/wishes.ts:22`). Not guard it, not adapt it — delete it. As long as a function exists that empties the table, some future route will call it (research R-401).
- [x] T012 [US1] **Delete `replaceJsonWishes`** (`wishes.ts:79`). The second delete path, behind the JSON fallback. The spec originally named only the first; retiring one and leaving the other means the fallback still eats corrections — and a fallback is reached exactly when something has already gone wrong.
- [x] T013 [US1] Stop `syncInputSetFromSources` (`webapp/src/services/raster/inputSets.ts`) writing `RasterWish`. It may still refresh the parsed cache (`wishesJson`); it must not touch active wishes (FR-001a).
- [x] T013a [US1] **Make the season model read active wishes** (FR-001c). `applyParsedWishDetails` (`inputSets.ts:340-360`) currently writes `homeWeekday`, `hall`, `startTime`, `spielwochePref` and `requestedRasterzahl` onto `model.teams` straight from the parse, keyed by `teamIdentityKey(clubId, label)`, and never reads `RasterWish`. Since validation and the optimizer consume the season model, **a corrected wish never reaches planning even before the sync deletes it**. Without this task the feature is cosmetic: imports stop overwriting a table nothing plans from, and conflicts are reviewed over data the optimizer ignores. The parse still seeds wishes (T014) — it just stops being what the model reads.
- [x] T013b [P] [US1] Integration-test that a correction reaches the optimizer, in `webapp/tests/integration/raster-wish-correction-plans.test.ts`: correct a wish, build the season model, and assert the model's team carries the **corrected** value rather than the parsed one; start a run and assert the solver input matches (SC-009). This is the half of the data loss that has no symptom — the correction is not deleted, it is simply ignored.
- [x] T014 [US1] Create `webapp/src/services/raster/wishImports.ts`: open a batch, record parsed rows, pair them (T007), diff them (T008), raise conflicts. **The existing wish is never written** (FR-002).
- [x] T015 [US1] Rework `POST /api/raster/input-sets/[id]/wishes/pdf` to open a batch and propose rather than replace (FR-001).
- [x] T016 [US1] Rework `POST /api/raster/input-sets/[id]/wishes/json` the same way. **Not a lesser path** — it is the fallback for when a PDF will not parse.
- [x] T017 [US1] Create `POST /api/raster/input-sets/[id]/wish-imports/conflicts/[conflictId]`: resolve as keep existing, use imported, or manual value (FR-004).
- [x] T018 [US1] Record each decision against the imported row's `valueFingerprint`, and skip raising a conflict for a value already decided for that wish (FR-004a). **Against the value, not the wish and not the batch** — per wish swallows a real change on a decided row; per batch is forgotten every import (research R-403, data-model.md).
- [x] T019 [US1] Render the conflict review in `webapp/src/app/(dashboard)/raster/import/page.tsx` — feature 005's Import step, where a source arrives and a proposal should be judged. Both values shown; 10 conflicts resolvable without leaving the screen (SC-005).
- [x] T020 [US1] Audit every decision with source, previous value, imported value, chosen value, actor and time via the existing `safeLogAudit` (FR-010).
- [x] T021 [US1] Leave existing wishes untouched when a parse yields no teams or matching fails (FR-012).
- [x] T022 [P] [US1] Integration-test the feature's whole point in `webapp/tests/integration/raster-wish-correction-survives.test.ts`: correct a wish, sync the source, **the correction is still there** and a conflict is raised (SC-001, SC-006). If this test does not exist, the feature is not done.
- [x] T023 [P] [US1] Integration-test decision memory in `webapp/tests/integration/raster-wish-decisions.test.ts`: resolve "keep existing" against a PDF value, re-import the **unchanged** PDF → **no conflict** (FR-004a, SC-007); change the PDF to a third value → a new conflict; resolve, then verify a decided value never re-raises.

**Checkpoint**: corrections survive imports. The live data loss is fixed.

---

## Phase 4: User Story 2 - Import new wishes without ceremony (Priority: P2)

**Goal**: New teams import freely; identical imports do nothing.

**Independent Test**: Import a PDF with a team that has no wish → added, marked imported/unreviewed. Re-import → no duplicate, no conflict.

- [x] T024 [US2] Add wishes for rows pairing with no existing wish, `origin = IMPORTED`, unreviewed (FR-005).
- [x] T025 [US2] Treat an exact-value pair as a no-op: no conflict, no duplicate, no write (FR-006, Assumptions).
- [x] T026 [US2] Surface unmatched rows for manual matching via `POST /api/raster/input-sets/[id]/wish-imports/rows/[rowId]/match` (FR-003a).
- [x] T027 [P] [US2] Integration-test in `webapp/tests/integration/raster-wish-import-new.test.ts`: a new team is added and marked unreviewed; re-importing the same PDF creates zero duplicates (SC-003); an unmatched row never becomes a second wish for a team that has one.

---

## Phase 5: User Story 3 - Missing from latest import (Priority: P3)

**Goal**: Wishes no source produces stay, marked.

**Independent Test**: Upload club B's PDF → A's and C's wishes are **not** marked missing. Delete a source → its wishes are marked, not deleted.

- [x] T028 [US3] Compute missing-from-import as active wishes no registered source currently produces — the **union of all wish sources**, not the last batch (FR-007a, research R-404). **Derived, not stored**: a flag needs clearing on every source add, refresh and delete, and is wrong in between.
- [x] T029 [US3] Keep the wishes of a deleted source, marked missing rather than removed (FR-007b).
- [x] T030 [US3] Let an admin confirm a missing wish is still valid (FR-007, US3-AS2).
- [x] T031 [US3] Render the marker in `webapp/src/app/(dashboard)/raster/review/page.tsx` — Review data, since it is a property of the data rather than of an import.
- [x] T032 [P] [US3] Integration-test in `webapp/tests/integration/raster-wish-missing.test.ts`: uploading one club's PDF marks no other club's wishes missing (SC-008); deleting a source marks rather than deletes.

---

## Phase 6: Runs and review surface

- [x] T033 Show unresolved conflicts prominently before validation and runs (FR-008).
- [x] T034 **Do not block runs on unresolved conflicts** (FR-009). This reverses the spec's original requirement, deliberately: the active wish is well-defined, so a run with open conflicts uses exactly what "keep existing" would have chosen. Verify by test that such a run **completes** — the reflex when FR-009a feels awkward is to put the gate back, and that would refuse runs whose inputs are valid.
- [x] T035 Record unresolved conflicts on the run at creation, **frozen** (FR-009a). Feature 006's coverage record is the eventual home but does not exist in `main`; record it here in a shape 006 can absorb (research R-405). Frozen matters for the same reason as in 006: a run started with five unresolved conflicts must still say so after they are resolved.
- [x] T036 Filter the review to unresolved conflicts, added wishes, missing-from-import and accepted/no-op matches (FR-011). FR-011 named the categories but not their boundaries, so this build reads them as: **added** = wish with `origin: IMPORTED` and no `reviewedAt` (the state FR-005 creates); **accepted** = a conflict carrying a decision; **no-op** = a row of the latest batch that paired with a wish and raised no conflict — the import agreeing with what we held. Accepted and no-op share one "settled" filter since neither wants a decision. Confirm those readings match the intent; they are the one part of 008 the spec did not pin down.
- [x] T037 [P] Integration-test in `webapp/tests/integration/raster-wish-run-not-blocked.test.ts`: a run with unresolved conflicts completes and its record states how many were outstanding (SC-004); resolving them afterwards leaves that record unchanged.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T038 Confirm no code path writes an active wish except conflict resolution and manual edit — grep `webapp/src/` for `rasterWish.deleteMany` and `rasterWish.createMany` and account for every hit.
- [x] T039 [P] Verify feature 005's matching review does not fire on import, only on a resolution that changes a wish. The two compose: 008 asks "should this wish change?"; 005 asks "given it changed, is it still matched to the right team?".
- [x] T040 [P] Walk `specs/008-wish-import-conflicts/quickstart.md` § "Verification against success criteria".
- [x] T041 Run `webapp/validate.ps1` (typecheck + lint) — constitution Principle VI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 before any migration.
- **Foundational (Phase 2)**: identity + diff. BLOCKS everything.
- **US1 (Phase 3)**: the MVP. Fixes the data loss.
- **US2 (Phase 4)**: needs Phase 3's batch machinery.
- **US3 (Phase 5)**: independent of Phases 3-4 in principle; needs the batch model.
- **Phase 6**: needs conflicts to exist.

### Feature dependencies

- **005** — merged and implemented. The review lives in its Import and Review steps.
- **009** — soft. Canonical identity makes pairing exact; without it, pairing uses names and unmatched rows are more common. Buildable first: unpaired rows are visible work, never silent duplicates.
- **006** — soft, one requirement. FR-009a's recording lands here in a shape 006 absorbs later (R-405). **Do not wait; do not substitute a gate.**

### Within Phase 3

T011/T012 (delete both paths) before T014 (the replacement). T007/T008 before T014. T018's fingerprint memory before T023 can pass.

### Parallel Opportunities

- T002 alongside T001.
- T009, T010 — different test files, both first.
- T022, T023, T027, T032, T037 — tests across different files.
- Phase 5 (US3) alongside Phase 4 by another developer.

---

## Implementation Strategy

### MVP (Phases 1–3)

Corrections survive imports. That is the live bug, and everything else is refinement.

**STOP and VALIDATE** against SC-001, SC-006, SC-007 — especially T022.

### Then

1. US2 → new wishes import freely, no duplicates.
2. US3 → missing-from-import.
3. Phase 6 → runs record what they did not resolve.

---

## Notes

- **T022 and T013b are the feature between them.** T022: correct a wish, sync, the correction survives. T013b: correct a wish, run, the optimizer plans against it. The data loss has two halves — the correction is deleted (T022), _and_ it never reached planning in the first place (T013b). Fixing only the first leaves a feature that protects data nothing reads.
- **Two delete paths, not one** (T011, T012). The spec named one; `replaceJsonWishes` does the same thing behind the fallback route.
- **`origin` is provenance, not permission** (T004). The rejected design returns as a column the moment a rebuild consults it.
- **Decisions attach to the imported value** (T018), not the wish and not the batch.
- **Do not restore the run gate** (T034). FR-009 removed it on purpose.
- Commit after each task or logical group.
