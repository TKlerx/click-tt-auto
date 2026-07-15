# Phase 0 Research: Wish Import Conflict Review

**Feature**: `008-wish-import-conflicts` | **Date**: 2026-07-15

IDs numbered from R-401 to avoid collision with 005 (R-001–R-008), 006 (R-101–R-106), 007 (R-201–R-206) and 009 (R-301–R-306).

---

## R-401: How do wishes stop being derived?

**Decision**: Delete both `replaceParsedWishes` and `replaceJsonWishes`. Parsing produces an **import batch of proposed rows**; nothing else writes an active wish.

**Rationale**: FR-001a makes wishes owned. The two current paths both run `deleteMany({ where: { inputSetId } })` and re-insert — one from parsed PDFs (`wishes.ts:33`), one from pasted JSON (`wishes.ts:89`). `syncInputSetFromSources` calls the first on every source sync, which is why an admin's correction survives only until the next refresh.

The tempting middle road — keep the rebuild, but skip rows that were edited — is the trap. It needs a reliable "was this edited?" flag on every row, and a delete that spares exactly those and no others. Get it subtly wrong and the silent data loss returns, looking fixed. The clarify session settled this: the spec's own Assumption says "existing wish" means the active wish "regardless of whether it was previously reviewed", which rules out protecting only edited rows and removes the need for the flag entirely.

Deleting the functions rather than rewriting their callers is deliberate. As long as a function exists that empties the table, some future route will call it.

**Consequence for `syncInputSetFromSources`**: it currently re-derives `wishesJson` *and* rewrites `RasterWish`. After this it may still refresh the parsed cache, but must not touch active wishes — it opens a batch instead.

**And a consequence the spec did not anticipate** (found by `/speckit.analyze`, 2026-07-15): stopping the rewrite is necessary but **not sufficient**. `applyParsedWishDetails` (`inputSets.ts:340-360`) builds the season model's wish fields — `homeWeekday`, `hall`, `startTime`, `spielwochePref`, `requestedRasterzahl` — straight from the parse, keyed by `teamIdentityKey(clubId, label)`. It never reads `RasterWish`. Validation and the optimizer consume the season model.

So **`RasterWish` is not "the active wish used by validation and optimization"** — the spec's Assumption asserted that, and it is false. A correction written by `updateWish` is invisible to planning *before* the sync deletes it. Owning `RasterWish` while the model keeps reading the parse would give a feature that protects data nothing plans from: imports would stop overwriting the table, conflicts would be reviewed over it, and the optimizer would carry on ignoring all of it.

FR-001c therefore makes the season model derive its wish fields from active wishes. The parse still *seeds* them; it stops being what the model reads.

**Alternatives considered**:
- *Keep the rebuild, protect edited rows*: needs an "edited" flag plus a correct selective delete. Rejected in clarification; the spec's Assumption forbids it.
- *Soft-delete rows instead of hard*: the wish is still replaced, just recoverably. Recovering a correction from a tombstone is not the same as never losing it.

---

## R-402: How is an imported row paired with an existing wish?

**Decision**: By **canonical team identity** where feature 009's roster is available; by `clubId` + `teamLabel` otherwise. A row that pairs with nothing becomes an unmatched import row (FR-003a) — never a second active wish for a team that already has one.

**Rationale**: To raise a conflict you must know that imported row X *is* wish Y. Get it wrong and there is no conflict — there is a duplicate, silently, which is FR-006's failure.

Parsed names are a weak key: the click-TT scraper drops the club number, which is why the OWL data contains both `SC GW Paderborn` and `TTV Grün-Weiß Daseburg` and why Phase 12 exists. Feature 009 imports `VereinNr` and makes the key exact.

But 008 must not wait for 009. The escape hatch is already in the spec's edge cases: an unpairable row is *visible work*, not silent corruption. That is the honest degradation — the review is noisier without 009, never wrong.

**Alternatives considered**:
- *Wait for 009*: the data loss is live now; 009 is a bigger feature spanning CLI and webapp.
- *Fuzzy-match names here*: duplicates Phase 12 with a second implementation of the same idea, which is the `match_duration_minutes` mistake PR #10 fixed.

---

## R-403: How is a decision remembered so it is not asked twice?

**Decision**: Store the decision against a fingerprint of the **imported value it ruled on**, not against the wish or the batch.

**Rationale**: FR-004a. The interesting case is the one that makes the naive design unusable: an admin sets 19:30 by hand, the PDF says 19:00 — that difference is *permanent*. Every future import of that unchanged PDF re-raises it. Store the decision per wish, and a genuinely new value (19:00 → 20:00) is silently swallowed on a row you once decided. Store it per batch, and it is forgotten the moment a new batch arrives, which is every import.

Per imported *value* is the only option that both stops re-asking and still notices change: "my 19:30 beats this PDF's 19:00" holds exactly as long as the PDF says 19:00.

This is the same shape as feature 005's per-record fingerprint (its R-004) and can reuse the normalisation: compare on normalised values so whitespace churn is not a new value.

**Alternatives considered**:
- *Per wish, whatever the PDF says*: quietest, and swallows real changes on decided rows — the miss this feature exists to prevent.
- *Per batch*: forgotten every import; equivalent to not remembering.

---

## R-404: What does "missing from latest import" compare against?

**Decision**: The **union of all registered wish sources** for the input set, not the batch just uploaded. Recomputed on demand, not stored as a flag.

**Rationale**: FR-007a. Wish PDFs are per club and uploaded separately, and `syncInputSetFromSources` already aggregates every source. Under a per-batch reading, uploading club B's PDF marks A's and C's wishes missing — the marker fires on every import and means nothing.

Derived rather than stored because it is a statement about *now*: which sources exist, and what they currently produce. A stored flag would need clearing on every source add, refresh and delete, and would be wrong in between.

**Deleting a source** is what genuinely makes its wishes missing (FR-007b) — they stay, marked, rather than vanishing. That is the useful case: it is exactly when someone would otherwise lose data without noticing.

**Alternatives considered**:
- *Per batch*: the literal reading of the Key Entity. Constant false positives.
- *Store a flag*: needs invalidation on every source mutation; wrong in between.

---

## R-405: Where do unresolved conflicts get recorded, given feature 006 is not built?

**Decision**: Record them on the run in this feature, in a shape 006's coverage record can absorb. Do **not** wait for 006, and do **not** add a gate instead.

**Rationale**: FR-009a says unresolved conflicts are recorded "consistent with feature 006's coverage record (its FR-030 to FR-038)". That record does not exist — `main` has no `coverageComplete`. The spec anticipated this: "If 006 has not landed, that recording needs its own home rather than a new gate."

The failure mode to avoid is the reflex one. FR-009 removes a refusal; if the recording has nowhere to live, the tempting fix is to put the refusal back. That would undo the clarification and contradict 005's group exclusion and 006's whole design.

So: this feature records what a run did not resolve, at run creation, frozen. 006 later generalises that into its coverage record — its FR-030 to FR-038 describe a superset (scopes spanned, excluded groups, wish gaps, capacity gaps), and unresolved conflicts are one more gap of the same kind.

**Ordering note**: if 006 lands first, this feature adds a field to its record instead. Either order works; neither blocks.

**Alternatives considered**:
- *Wait for 006*: couples a live data-loss fix to a feature gated on a solver question.
- *Block runs until conflicts are resolved*: reverses the clarification, and refuses runs whose inputs are valid.

---

## R-406: What is a conflict — a row, or a field?

**Decision**: One conflict per (wish, imported row) pair, carrying the fields that differ. Resolved as a whole.

**Rationale**: FR-003 says "for every differing existing/imported wish pair" — pair-level. FR-004's three resolutions (keep existing, use imported, manual value) are answers about a wish, not about a field: "use imported" for a row whose day *and* time changed means take the row.

Per-field conflicts would let an admin assemble a wish that neither the system nor the PDF ever proposed — half the old row, half the new — which is what "manual value" already covers explicitly, deliberately, and visibly.

**Cost, stated**: a row differing only in `notes` raises the same conflict as one differing in day and time. FR-002 lists `notes` among the conflicting fields, so that is the spec's intent — but it is worth watching. If notes-only conflicts turn out to be noise, the fix is a spec change, not a quiet exclusion here.

**Alternatives considered**:
- *Per field*: finer, and invites hybrid rows nobody proposed.
- *Per batch*: one decision for an entire import. Fast and useless.

---

## Resolved unknowns summary

| ID | Unknown | Decision |
|---|---|---|
| R-401 | Ending derived wishes | Delete **both** replace functions; parsing proposes |
| R-402 | Pairing rows to wishes | Canonical identity where 009 exists; names otherwise; unpaired = visible work |
| R-403 | Remembering decisions | Fingerprint the imported value ruled on |
| R-404 | "Missing from latest import" | Union of registered sources, derived not stored |
| R-405 | Recording unresolved conflicts | Here, absorbable by 006 later. No gate, no waiting |
| R-406 | Conflict granularity | Per (wish, imported row); resolved whole |

**No NEEDS CLARIFICATION remain.**
