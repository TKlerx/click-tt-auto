# Phase 1 Data Model: Wish Import Conflict Review

**Feature**: `008-wish-import-conflicts` | **Date**: 2026-07-15

Three new tables, one changed. Verified against `main` after feature 005 landed — 005 rekeyed the schema but left `RasterWish` and the wish services untouched.

---

## Changed: RasterWish

Becomes an **owned** record. Today it is derived: `deleteMany({ inputSetId })` then re-insert, on every sync.

| Field | Change | Notes |
|---|---|---|
| `origin` | **added** — `RasterWishOrigin` | `IMPORTED` (accepted from a batch) or `MANUAL` (entered or corrected by hand). Provenance, not permission — an untouched wish is protected exactly as a corrected one is (FR-002a) |
| `reviewedAt` / `reviewedById` | **added**, nullable | When a human last confirmed this wish. Feeds FR-005's "imported/unreviewed" marking |
| everything else | unchanged | `clubId`, `clubName`, `teamLabel`, `homeWeekday`, `hall`, `startTime`, `spielwochePref`, `requestedRasterzahl`, `notes`, `source`, `confidence` |

**Uniqueness**: `@@unique([inputSetId, clubId, teamLabel])` — **added**.

There is no unique constraint today, which is what allows the duplicates FR-006 forbids. The constraint is the enforcement; without it, "avoid duplicate active wishes" is a hope. `teamLabel` is nullable, so a partial index or a normalised sentinel is needed — see Validation.

### Why `origin` is not permission

FR-002a: an untouched wish is protected exactly as a corrected one is. `origin` records where a value came from, for the audit trail (FR-010) and for showing "imported/unreviewed" (FR-005). It must never become the thing a rebuild checks before deciding whether to overwrite — that is the "protect only edited rows" design the clarification rejected, smuggled back in as a column.

---

## New: RasterWishImportBatch

One import operation — one or more PDFs, or one JSON paste.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `inputSetId` | `String` | FK to `RasterInputSet`, `onDelete: Cascade` |
| `startedById` | `String` | FK to `User`, `onDelete: Restrict` |
| `startedAt` | `DateTime @default(now())` | |
| `sourceKind` | `RasterWishImportKind` | `PDF` or `JSON` — the two paths that exist |
| `rows` | `RasterImportedWishRow[]` | |

**Indexes**: `@@index([inputSetId, startedAt])`.

Both current entry points open a batch. `replaceJsonWishes` is not a lesser path to be handled later: the JSON route is the fallback used *when a PDF will not parse*, which is exactly when someone has been doing careful manual work worth not destroying.

---

## New: RasterImportedWishRow

One parsed candidate from a batch. Never active on its own.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `batchId` | `String` | FK to `RasterWishImportBatch`, `onDelete: Cascade` |
| `sourceFile` | `String?` | Which PDF it came from. Null for JSON |
| `matchedWishId` | `String?` | The active wish it pairs with (FR-003a). **Null = unmatched** — manual matching, not a new wish |
| parsed fields | | `clubId`, `clubName`, `teamLabel`, `homeWeekday`, `hall`, `startTime`, `spielwochePref`, `requestedRasterzahl`, `notes` — the shape being proposed |
| `valueFingerprint` | `String` | Normalised hash of the proposed values. What a decision is remembered against (R-403) |
| `createdWish` | `Boolean @default(false)` | This row is the one that brought `matchedWish` into existence. What "added by the latest import" means (FR-011) — scoping it to the batch is why that filter empties instead of standing at the whole roster forever |

**Indexes**: `@@index([batchId])`, `@@index([matchedWishId])`.

---

## New: RasterWishConflict

One difference between an active wish and an imported row (FR-003).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `inputSetId` | `String` | FK, `onDelete: Cascade`. Denormalised from the batch so unresolved conflicts are queryable per input set without a join (FR-008) |
| `wishId` | `String` | FK to `RasterWish`, `onDelete: Cascade` |
| `importedRowId` | `String` | FK to `RasterImportedWishRow`, `onDelete: Cascade` |
| `differingFields` | `String` | Which fields differ. Display, not logic |
| `decision` | `RasterConflictDecision?` | `KEEP_EXISTING`, `USE_IMPORTED`, `MANUAL` — null while unresolved |
| `previousValueJson` | `String?` | The wish as it stood when the decision was taken. FR-010 asks for the *previous* value, and `USE_IMPORTED` overwrites the wish in place, so without this snapshot the value the decision replaced is gone |
| `decidedValueJson` | `String?` | The chosen values |
| `decidedById` / `decidedAt` | nullable | |

**Uniqueness**: `@@unique([wishId, importedRowId])`.  
**Indexes**: `@@index([inputSetId, decision])` — FR-008 lists unresolved conflicts prominently; this is what makes that cheap.

### The decision memory (FR-004a) — the fragile part

A conflict is resolved against `RasterImportedWishRow.valueFingerprint`. On a later import, a row whose fingerprint matches one already decided for the same wish **raises no conflict**.

That is what makes re-importing an unchanged PDF silent for a corrected row. Without it, a manual 19:30 versus a PDF's 19:00 is a permanent difference re-raised on every import, forever.

The failure mode: remember the decision against the **wish** instead, and a genuinely new value (19:00 → 20:00) is swallowed on a row already decided — the exact miss this feature exists to prevent. Against the **batch**, and it is forgotten every import. Only against the *value* does it both stop re-asking and still notice change.

Fingerprints use the same normalisation as feature 005's `RasterMatchReview` (its R-004): normalise before hashing, so whitespace churn is not a new value.

---

## New enums

```
RasterWishOrigin        IMPORTED | MANUAL
RasterWishImportKind    PDF | JSON
RasterConflictDecision  KEEP_EXISTING | USE_IMPORTED | MANUAL
```

---

## Derived, never stored

**Missing from latest import** (FR-007, R-404). An active wish no registered source currently produces. Computed on demand from the union of all wish sources — not a flag, because it is a statement about *now*: a stored flag needs clearing on every source add, refresh and delete, and is wrong in between.

**Unresolved conflict count for a run** (FR-009a). Read at run creation and frozen onto the run — see below.

---

## Recording unresolved conflicts on a run (FR-009a)

Feature 006's coverage record does not exist in `main`. Per research R-405, this feature records the count and identity of unresolved conflicts on the run **at creation, frozen**, in a shape 006's record can absorb — its FR-032 gaps (excluded groups, wish gaps, capacity gaps) are the same kind of thing.

**Frozen matters** for the same reason it does in 006: a run started with five unresolved conflicts must still say so after they are resolved. Recomputing at read time would make an old snapshot retroactively flattering.

**What must not happen**: if this recording feels awkward without 006, the reflex is to reinstate the block FR-009 removed. That reverses the clarification and refuses runs whose inputs are valid.

---

## Unchanged, but load-bearing

| Entity | Why |
|---|---|
| `RasterMatchReview` (005) | Composes with this. Under owned wishes a re-parse changes no active wish, so 005's matching review does not fire on import — only once a conflict is resolved into a change. 008 asks "should this wish change?"; 005 asks "given it changed, is it still matched to the right team?" |
| `RasterInputSet.wishesJson` | The parsed cache. May still refresh on sync; it is not the active wish |
| `RasterInputSet.seasonModelJson` | Built from active wishes. Unaffected until a conflict resolves into a change |
| `RasterSource` | Untouched. The union of wish sources is what FR-007a compares against |

---

## Validation rules

| Rule | Source | Enforced |
|---|---|---|
| No automated path rewrites an active wish | FR-001a | Both replace functions **deleted** (R-401), not guarded |
| No duplicate active wish per team | FR-006 | `@@unique([inputSetId, clubId, teamLabel])` |
| An unpairable row never becomes a second wish | FR-003a | `matchedWishId` null ⇒ unmatched, surfaced for manual matching |
| A decided value never re-raises | FR-004a | Fingerprint match against decided conflicts |
| An exact-match import is a no-op | Assumptions | Fingerprint equality ⇒ no conflict, no row change |
| Unresolved conflicts never block a run | FR-009 | Absence of a guard; integration-tested |
| Every decision is auditable | FR-010 | `decidedBy`/`decidedAt` + existing `safeLogAudit` |

### `teamLabel` is nullable

`@@unique([inputSetId, clubId, teamLabel])` treats NULLs as distinct in PostgreSQL, so two label-less wishes for one club would both be allowed — a duplicate the constraint was meant to stop. Either normalise absent labels to a sentinel before writing, or add a partial unique index for the null case. Worth deciding at implementation; it is the kind of gap that passes every test until real data has a team with no label.

---

## Migration approach

There is no production data (feature 005's FR-024 established this and its migration acted on it). So:

- New tables and columns are additive.
- `RasterWish.origin` needs a default for existing rows — `IMPORTED` is right: everything currently there came from a parse.
- `@@unique([inputSetId, clubId, teamLabel])` may fail on existing duplicates. There should be none, since every current row was written by one `createMany` from deduplicated parse output — but **verify rather than assume**, the same reasoning 005's R-006 applied. A migration that fails on a unique constraint is loud and safe; one that silently drops rows to satisfy it is neither.
