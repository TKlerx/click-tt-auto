# Quickstart: Wish Import Conflict Review

**Feature**: `008-wish-import-conflicts` | **Date**: 2026-07-15

---

## The one thing to internalise

**This fixes live data loss.** Not a hypothetical, not a hardening exercise.

```
webapp/src/services/raster/wishes.ts:116   updateWish        → writes the admin's correction into RasterWish
webapp/src/services/raster/wishes.ts:33    replaceParsedWishes → deleteMany({ inputSetId }) on the next sync
webapp/src/services/raster/wishes.ts:89    replaceJsonWishes   → the same, via the JSON fallback
```

Correct a wish, refresh a source, correction gone. Silently. Today.

It costs nothing right now only because there is no production data. It starts costing the moment real OWL 2026/27 corrections exist — which is also when someone starts re-importing PDFs, i.e. exactly when it bites.

---

## Orientation

| What | Why |
|---|---|
| `webapp/src/services/raster/wishes.ts` | Both delete paths and `updateWish`. The whole problem, in one file |
| `webapp/src/services/raster/inputSets.ts` § `syncInputSetFromSources` | Calls `replaceParsedWishes` on every sync. Must stop touching active wishes |
| `webapp/src/app/(dashboard)/raster/import/page.tsx` | Feature 005's Import step. Where the review lives |
| `specs/008-…/spec.md` § Clarifications | Four decisions, three of which reversed what the spec first said |
| `specs/005-…/data-model.md` § Matching review state | The fingerprint pattern to reuse, and the review this composes with |

---

## Build order

### Stage 1 — User Story 1: conflicts (P1) 🎯 MVP

1. New tables; `RasterWish` gains `origin`, `reviewedAt`, and the unique constraint.
2. `wish-identity.ts` — pair a row to a wish. Unpaired ⇒ unmatched row, **never** a second wish.
3. `wish-diff.ts` — compare on **normalised** values, fingerprint the imported value.
4. **Delete** `replaceParsedWishes` and `replaceJsonWishes`. Both routes open a batch instead.
5. `syncInputSetFromSources` stops writing `RasterWish`.
6. Conflict review in the Import step; resolve keep / use / manual.

**Verify**: correct a wish → refresh the source → **the correction survives**. That single check is the feature.

### Stage 2 — User Story 2: new wishes, no duplicates (P2)

Unpaired-but-resolvable rows become wishes marked imported/unreviewed. Identical re-imports do nothing.

**Verify**: re-import the same PDF twice → zero duplicates, zero conflicts.

### Stage 3 — User Story 3: missing from import (P3)

Wishes no registered source produces, marked and kept. Computed, not stored.

**Verify**: upload club B's PDF → **A's and C's wishes are not marked missing**. Delete a source → its wishes are marked, not deleted.

---

## Verification against success criteria

| SC | How |
|---|---|
| SC-001 | Conflicting import → 100% of existing wishes unchanged until resolved |
| SC-002 | Unresolved conflicts identifiable for an input set in <30s |
| SC-003 | Re-upload the same PDFs → zero duplicate wishes |
| SC-004 | A run with unresolved conflicts **completes**, and its result says how many were outstanding |
| SC-005 | 50-team import, 10 conflicts → all resolvable without leaving the screen |
| SC-006 | A correction is never lost to any later import or sync |
| SC-007 | Re-importing an unchanged PDF raises conflicts only for manually changed wishes, once each |
| SC-008 | Re-uploading one club's PDF marks no other club's wishes missing |

`webapp/validate.ps1` before commit — constitution Principle VI.

---

## Traps

- **Keeping the rebuild and sparing edited rows.** The clarification rejected this. It needs an "edited" flag and a delete that spares exactly the right rows; get it subtly wrong and the silent loss returns *looking fixed*. Delete the functions (R-401).
- **Forgetting `replaceJsonWishes`.** There are **two** delete paths. The spec originally named one. The JSON route is the fallback used when a PDF will not parse — when careful manual work is most at risk.
- **Making `origin` a permission.** It is provenance. FR-002a: an untouched wish is protected exactly as a corrected one is. The moment a rebuild checks `origin` before overwriting, the rejected design is back as a column.
- **Remembering a decision against the wish.** Then a real change (19:00 → 20:00) is swallowed on a decided row. Against the batch, it is forgotten every import. **Against the imported value** (R-403).
- **Fingerprinting raw text.** Whitespace churn becomes a new value and re-raises decided conflicts. Normalise first — reuse 005's rule.
- **Per-batch "missing from import".** Uploading one club's PDF then marks every other club's wishes missing. Union of sources (R-404).
- **Reinstating the run gate** because FR-009a's recording is awkward without 006. That reverses the clarification and refuses runs whose inputs are valid (R-405).
- **Trusting `@@unique([inputSetId, clubId, teamLabel])` with null labels.** PostgreSQL treats NULLs as distinct, so two label-less wishes for one club both pass. Passes every test until real data has a team with no label.

---

## Out of scope

Fuzzy club matching (Phase 12 / T079-T082 — this uses canonical identity where 009 provides it, and surfaces unmatched rows otherwise); the roster import (009); the guided flow (005); 006's coverage record, which this anticipates without waiting for.
