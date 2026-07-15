# Specification Quality Checklist: nuLiga Team Roster Import

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-07-15  
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

**Updated**: 2026-07-15 (clarify session — Q1 resolved; CLI collection and bundle upload added)

**Status: ready for `/speckit.plan`.** Q2 and Q3 remain, and both can be settled at planning.

### What the clarify session settled, and a correction

**Q1 resolved: the CLI downloads the export.** I had recommended leaving it manual, reasoning the roster changes "about once a season". That was wrong twice over — the roster changes whenever a team registers or withdraws, and the export takes about five seconds, so the wait is no obstacle. I had reached for the option that avoided the constitution question rather than the one that answers it.

**The constitution worry was largely moot, and checking the code showed it.** `scrapeSeasonModel` (`src/raster/ingest/scrape.ts:91`) already launches Chromium with `acceptDownloads: true`, signs in with credentials from `.env`, and downloads wish PDFs into `reports/raster/clicktt-downloads`. Credentialed click-TT automation is capability 1 and already exists. Adding the nuLiga Downloads navigation is one more step on a working session — not a new credential surface, and the webapp stays read-only toward click-TT exactly as Principle II requires (FR-018).

**Bundle upload (FR-019a-d).** With the CSV landing beside the wish PDFs, a scope's inputs are one directory, so the CLI emits one bundle and the webapp takes one upload. The load-bearing part is FR-019b: an incomplete bundle must say what is missing. Importing what is present and reporting success is how a scope ends up half-loaded with nobody aware — the same class of silent-success failure as the character-set hazard below.

**One assumption worth testing early**: FR-014 assumes the credentials the CLI already uses reach nuLiga admin. click-TT runs on nuLiga (`nuLigaTTDE.woa` in the scraped URLs), so one login plausibly reaches both — but if the admin area needs a separate account, FR-014 needs revisiting.

## Notes

### Why this feature exists

Raised from feature 008's clarification. 008 anchors wish-conflict detection on canonical team identity, and nothing in the system provides one.

The click-TT scraper (`src/raster/ingest/clicktt-assignments.ts:167`) reads a team's **name** from a table cell and drops the club number. Everything downstream inherits that: `splitTeamName` regexes a display string to classify a team, and Phase 12 (T079-T082 on 004) exists solely to reconcile two spellings of one club by fuzzy matching and persisted aliases.

The nuLiga export carries `VereinNr`. **The alias problem is an artifact of the import path, not of the domain** — click-TT knows `SC GW Paderborn` is club 42706; the scraper never asks. This feature is therefore expected to *shrink* Phase 12 rather than add to it.

The sample data proves the problem is real, not theoretical: OWL 2026/27 contains both `SC GW Paderborn` (42706) and `TTV Grün-Weiß Daseburg` (42522). "GW" is an abbreviation of "Grün-Weiß" — exactly the ambiguity Phase 12 exists to resolve.

### Verified against real data, not assumed

The OWL 2026/27 sample (`data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv`) was parsed to establish the claims here rather than inferred:

- 404 teams, 85 clubs, 43 groups, 16 Ligen, one Region, one Saison
- `VereinNr` + `Altersklasse` + `MannschaftNr` unique across all 404 rows — **zero duplicates**
- `Altersklasse` values: `Erwachsene` (295), `Jugend 19` (45), `Jugend 15` (37), `Jugend 13` (14), `Damen` (13)

That last line independently confirms `splitTeamName`'s vocabulary (`Jugend <n>`, `Damen`, `Erwachsene`) and is the canonical source the match-duration heuristic should read (see Q2).

### The character set is the sharpest risk, and it fails silently

nuLiga defaults the Zeichensatz to **ISO-8859-15**; the sample in `data/` happens to be UTF-8. Both are normal.

**ISO-8859-15 cannot fail to decode** — every byte maps to a character — so an importer that assumes it will not error on a UTF-8 file. It will record `TTV GrÃŒn-WeiÃ Daseburg` and report success. Verified against the sample:

| Correct | Misdecoded |
|---|---|
| `Tischtennisverein Höxter` | `Tischtennisverein HÃ¶xter` |
| `TTV Grün-Weiß Daseburg` | `TTV GrÃŒn-WeiÃ Daseburg` |
| `SSV Blau-Weiß Blankenau` | `SSV Blau-WeiÃ Blankenau` |

Umlauts are common in German club names, so this is the normal case. FR-012 therefore refuses rather than guesses: a roster of mojibake is worse than no roster, because it looks imported.

**One structural mitigation worth keeping in view**: `VereinNr` is ASCII digits. A charset mistake corrupts display names but never identity — the system stays *correct* even when it looks wrong. Another argument for anchoring on the number (FR-020).

### What `/speckit.analyze` caught (2026-07-15)

**The plan contradicted the spec, and the originating intent.** FR-017 and US3-AS4 require the CLI to emit a bundle; the stated intent was "the final step would just be a zip bundling". Research R-303 had decided the opposite — CLI emits a directory, admin zips it by hand — to avoid a CLI dependency. That inverted Principle I, which asks that dependencies be *narrowly scoped and justified*, not avoided at the cost of the requirement. Designing around a dependency the feature was asked for is the plan overruling the spec. Reversed: the CLI writes the zip (T019a), justified alongside the webapp's reader.

**plan.md never declared the feature 005 dependency**, while data-model.md and tasks.md both did. Same failure `/speckit.analyze` caught on feature 007 — a plan disagreeing with its own tasks about what the feature depends on — here by silence rather than a wrong claim. Now stated.

**T001 had no second branch.** It said tests "need a synthetic file instead" if the real export cannot be committed, and no task built one — so declining T001 quietly stranded SC-001/SC-002/SC-003. T001a now covers it, and notes that 404/85/43 describe the *real* export and must be restated if a synthetic fixture is used.

### Live risks

- **FR-014 assumes one login reaches both click-TT and nuLiga admin.** Plausible — click-TT runs on nuLiga (`nuLigaTTDE.woa`) — but unverified. If the admin area needs a separate account, this needs revisiting. Worth checking before planning the CLI half.
- **The export is generated asynchronously** — Exportieren, then wait for a link, roughly 5 seconds. Short, but it is a wait, not a fetch: FR-015 requires waiting for the link and saving nothing partial if it never comes.
- **FR-032 keeps this additive.** Scopes with no imported roster behave exactly as before. That is what lets 008 ship without this feature, at the cost of a noisier review.

### Relationship to other features

- **008** anchors conflict pairing on the identity this supplies. 008 is buildable first — unpaired rows surface for manual matching rather than duplicating — but is weaker until this lands.
- **Phase 12 (T079-T082 on 004)** should shrink once the match target is canonical. It cannot be deleted: wish PDFs carry names, not numbers, so matching names *to* the roster still needs fuzzy logic. What changes is that it becomes matching against a fixed known set rather than reconciling two name-lists.
- **PR #10** aligned a youth-duration heuristic across three implementations. `Altersklasse` (FR-021, Q2) would remove the heuristic rather than align it — but only for rostered scopes, so the label path survives regardless.
- **006** wants a realistic fixture for its solver-scale question (its SC-008). 404 teams / 85 clubs is one.
