# Phase 1 Contracts: Wish Import Conflict Review

**Feature**: `008-wish-import-conflicts` | **Date**: 2026-07-15

Two existing endpoints change meaning, one endpoint group is new, and one service pair is deleted.

---

## Deleted

| What | Why |
|---|---|
| `replaceParsedWishes` (`wishes.ts:22`) | `deleteMany({ inputSetId })` + re-insert. The data loss |
| `replaceJsonWishes` (`wishes.ts:79`) | The same, behind the JSON fallback route |

**Deleted, not guarded.** As long as a function exists that empties the table, some future route calls it. This is the feature's central inversion; a rebuild taught to spare the right rows is the same bug with more code.

`syncInputSetFromSources` may still refresh the parsed cache (`wishesJson`). It must no longer touch `RasterWish`.

---

## Changed: the two import routes

| Endpoint | Was | Becomes |
|---|---|---|
| `POST /api/raster/input-sets/[id]/wishes/pdf` | Parse → replace **all** wishes | Parse → open a batch → propose (FR-001) |
| `POST /api/raster/input-sets/[id]/wishes/json` | Same, from pasted JSON | Same. **Not a lesser path** — it is the fallback used when a PDF will not parse, i.e. exactly when careful manual work is at risk |

Both keep their auth and their shape. What changes is that **neither writes an active wish**.

### Import outcome

| Case | Result |
|---|---|
| Row pairs with a wish, values identical | No-op. No conflict, no duplicate (FR-006) |
| Row pairs with a wish, values differ | **Conflict** (FR-003). Existing wish untouched (FR-002) |
| Row pairs with a wish, differing value already decided | **Nothing** (FR-004a). The decision holds while the imported value is unchanged |
| Row pairs with no wish | New wish, `origin = IMPORTED`, unreviewed (FR-005) |
| Row pairs with nothing resolvable | **Unmatched import row** for manual matching (FR-003a). Never a second wish for a team that has one |
| Parse yields no teams | Import fails; existing wishes untouched (FR-012) |

---

## New: import review

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/raster/input-sets/[id]/wish-imports` | `GET` | Batches, conflicts, unmatched rows, missing-from-import (FR-011) |
| `/api/raster/input-sets/[id]/wish-imports/conflicts/[conflictId]` | `POST` | Resolve: keep existing, use imported, or a manual value (FR-004) |
| `/api/raster/input-sets/[id]/wish-imports/rows/[rowId]/match` | `POST` | Match an unmatched row to a team by hand (FR-003a) |

**Authorisation**: the `scheduler` level, consistent with the other input-set write routes after feature 007. Until 007 lands, whatever those routes currently use.

### Resolution contract

- **Keep existing** — the wish is untouched; the decision is recorded against the imported value's fingerprint.
- **Use imported** — the wish takes the proposed values; `origin` stays `IMPORTED`.
- **Manual** — the wish takes values the admin supplies; `origin` becomes `MANUAL`.

All three record actor, time, previous value, imported value and chosen value (FR-010). All three are remembered against the **imported value**, so re-importing it raises nothing (FR-004a).

**Resolving into a change is what wakes feature 005's matching review.** An import alone never does — the wish did not change, so 005's fingerprint did not change. The two compose: 008 asks *should this wish change?*, 005 asks *given it changed, is it still matched to the right team?*

---

## Filtering (FR-011)

The review filters to: unresolved conflicts, added wishes, missing-from-import wishes, and accepted/no-op matches.

**Missing-from-import is computed, not stored** (R-404): active wishes that no registered source currently produces — the union of sources, not the last batch. Uploading one club's PDF must not mark another club's wishes missing (FR-007a).

---

## Run contract

**Unresolved conflicts do not block a run** (FR-009). This reverses the spec's original requirement, and it is deliberate: the active wish is well-defined at all times, so a run with open conflicts uses exactly what "keep existing" would have chosen. The inputs are valid; only a *proposal* is undecided.

At run creation, the unresolved conflicts are **recorded on the run and frozen** (FR-009a) — a run started with five must still say so after they are resolved.

Feature 006's coverage record is the eventual home; it does not exist yet, so this feature records them itself in a shape 006 can absorb (R-405). **The reflex to avoid**: if that feels awkward, do not reinstate the block. That would undo the clarification and refuse runs whose inputs are fine.
