# Specification Quality Checklist: Wish Import Conflict Review

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-15  
**Updated**: 2026-07-15 (clarify session: 5 questions asked and answered)  
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

**Status: ready for `/speckit.plan`.**

## Notes

### Re-verified against `main` after feature 005 landed (2026-07-15)

005 shipped between this spec being written and it being planned. Its rekey touched the schema but left the wish logic alone, so the premise below is **current, not historical** — `replaceParsedWishes` still deletes, `updateWish` still writes corrections into what it deletes.

Re-checking also found something the spec had missed: **there are two delete-and-recreate paths, not one.** `replaceJsonWishes` (`wishes.ts:79`) runs the same `deleteMany({ inputSetId })` behind the structured-JSON fallback route. FR-001b named only `replaceParsedWishes`, so retiring that alone would have left the fallback quietly eating corrections — and a fallback is reached exactly when something has already gone wrong, which is the worst moment to lose work. FR-001b now covers both explicitly.

### What `/speckit.analyze` caught at planning (2026-07-15) — the spec asserted something untrue about the code

**`RasterWish` is not "the active wish used by validation and optimization".** The spec's Assumption said it was, and FR-001a rested on that. It is false.

`applyParsedWishDetails` (`webapp/src/services/raster/inputSets.ts:340-360`) writes the season model's `homeWeekday`, `hall`, `startTime`, `spielwochePref` and `requestedRasterzahl` onto `model.teams` **straight from the parsed sources**, keyed by `teamIdentityKey(clubId, label)`. It never reads `RasterWish`. Validation and the optimizer consume the season model.

So the data loss has **two halves**, and the spec only saw one:

1. A correction is **deleted** by the next sync. (What the spec describes.)
2. A correction **never reached planning anyway**, because the model is built from the parse. (Silent, symptomless, and unnoticed.)

Fixing only the first yields a feature that protects a table nothing plans from — imports stop overwriting `RasterWish`, conflicts are reviewed over `RasterWish`, and the optimizer carries on reading the parse. **Cosmetic.**

FR-001c and T013a make the season model derive its wish fields from active wishes; T013b tests that a correction reaches the solver input. The Assumption is corrected in place rather than deleted, because the wrong version explains why the requirement was missing.

This is the class of error a spec cannot catch by reading itself: it was a confident claim about code, made without checking the code.

### The data loss this feature prevents is live, not hypothetical

`updateWish` (`webapp/src/services/raster/wishes.ts:115`) writes admin corrections straight to `RasterWish`. `replaceParsedWishes` (same file, line 21) then runs `deleteMany({ inputSetId })` on the next sync and rebuilds from parsed PDFs. Every correction is destroyed silently, today. FR-002 is a bug report as much as a requirement.

### What the clarify session settled

- **Wishes become owned, not derived** (FR-001a/b). Today they are rebuilt from the union of all registered sources on every sync. That model and FR-002 cannot both hold. The spec's own Assumption already implied the answer — "existing wish" means the active wish "regardless of whether it was previously reviewed" — which rules out protecting only edited rows. `replaceParsedWishes` is retired rather than taught to spare rows: a bulk delete that must skip exactly the right records is the failure mode, not the fix.
- **Decisions are remembered per imported value** (FR-004a). Without this, every corrected row re-asks on every import forever, because the correction permanently differs from the PDF. With it, re-importing an unchanged PDF raises conflicts only where the admin has manually changed something — and each of those only once.
- **"Latest import" is the union of all sources, not the last batch** (FR-007a/b). The literal reading of the Key Entity would have marked every club's wishes missing whenever any single club's PDF was re-uploaded, firing constantly and meaning nothing.
- **Unresolved conflicts do not block runs** (FR-009, reversed; SC-004 rewritten). The active wish is well-defined at all times, so a run with open conflicts uses exactly what "keep existing" would have chosen — valid inputs, not broken ones. Recording beats refusing, consistent with 005's group exclusion and 006's coverage record. This reversed the original FR-009 and SC-004.
- **Conflicts anchor on canonical team identity** (FR-003a) — `VereinNr` + `Altersklasse` + `MannschaftNr` — not on parsed club names.

### The identity finding, and why it reaches beyond this feature

The click-TT scraper (`src/raster/ingest/clicktt-assignments.ts:167`) takes a team's **name** from a table cell and nothing else — no club number. That is why `splitTeamName` regexes a display string, and why Phase 12 (T079-T082 on 004) exists: given only names, `SC GW Paderborn` and `SC Grün-Weiß Paderborn` need fuzzy matching and persisted aliases.

The nuLiga admin export carries what the scraper drops. The OWL 2026/27 sample (`data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv`) holds 404 teams / 85 clubs / 43 groups, with `VereinNr` per club (`SC GW Paderborn` = 42706 — the very club from the Phase 12 example) and `Altersklasse` per team. `VereinNr` + `Altersklasse` + `MannschaftNr` is unique across all 404 rows.

**So the alias problem is an artifact of the import path, not of the domain.** click-TT knows the number; the scraper does not take it. Three consequences worth carrying forward:

- Importing that export would likely **shrink Phase 12** rather than add work — much of it compensates for the missing `VereinNr`.
- `Altersklasse` is a canonical source for youth-ness, which is what the match-duration heuristic (PR #10) should read instead of regexing a label.
- 404 teams / 85 clubs is a realistic fixture for feature 006's solver-scale question (SC-008).

### Live risks

- **This feature is buildable before the identity importer lands, but weaker without it.** Until then, pairing rests on parsed names and unmatched rows will be common. It never silently duplicates — unpaired rows surface for manual matching (FR-003a) — but the review will be noisier than it should be.
- **FR-009a leans on feature 006's coverage record.** If 006 has not landed, recording unresolved conflicts on a run needs another home. It must not become a gate; that would reintroduce the FR-009 this session reversed.
- **Feature 005's FR-010 needs rewording** once this lands: under owned wishes a source refresh alone no longer changes a record, so 005's matching review fires on conflict *resolution*, not on refresh. The two compose — 008 asks "should this wish change?", 005 asks "given it changed, is it still matched to the right team?" — but 005's wording predates this feature.

### Suggested follow-up: feature 009

An importer for the nuLiga admin export ("Tabellen (aktuelle Tabelle - Filter Meisterschaft)"), giving canonical team identity.

Obtained today by hand: sign in to nuLiga admin → Downloads → select the export → Exportieren → wait for the link. Automating that needs an authenticated admin session, which the constitution scopes to the CLI capabilities rather than the webapp (Principle I; the existing scraper reads *public* pages only). So the cheap first version is a new source type accepting a manually-exported CSV, with Playwright automation as a later step — which is a design question for 009, not for this feature.
