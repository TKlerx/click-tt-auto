# Tasks: nuLiga Team Roster Import

**Input**: Design documents from `/specs/009-nuliga-team-roster-import/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/roster-import.md, quickstart.md

**Tests**: Not a TDD pass. Test tasks appear where a requirement fails *silently* and nothing else would catch it — chiefly the character set (FR-010–FR-013), which succeeds and lies rather than throwing.

**Organization**: Grouped by user story. Stories 1+2 are both P1 and ship together; so are 3+4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US6 per spec.md
- Paths are repo-relative. This feature spans the CLI (`src/`) and the webapp (`webapp/`)

---

## Phase 1: Setup

- [x] T001 **Resolved 2026-07-15: yes.** `data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv` is committed as the fixture — one export, real OWL 2026/27 data, alongside the already-tracked `data/hall-capacity.csv` and `data/upper-fixed.csv`. SC-001's 404/85/43 are therefore testable against the real file rather than restated against a synthetic one. No synthetic fixture is needed.
  - The ISO-8859-15 counterpart for T007 is still **generated at test time** from this file rather than committed — two encodings of identical content is a fixture that can silently drift.
- [x] T002 [P] Add a `RosterCharset` enum (`UTF8`, `ISO_8859_15`) and the roster tables to `webapp/prisma/schema.postgres.prisma` per data-model.md, and generate the migration.

**Checkpoint**: T001 decides whether the rest can be verified against real data.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Create `src/raster/ingest/roster-csv.ts` taking **file bytes, not a string**. The charset decision belongs to the parser; handing it a string means someone already chose, probably wrongly. Returns the roster rows plus the charset used.
- [x] T004 Implement the charset rule in `roster-csv.ts` per research R-301: strict UTF-8 → on `UnicodeDecodeError`-equivalent, ISO-8859-15 → refuse if a UTF-8-valid file contains mojibake markers (`Ã¼`, `Ã¶`, `Ã¤`, `Ã`, `Â`), which means it was double-encoded upstream (FR-010, FR-011, FR-012). **Never assume ISO-8859-15**: it cannot fail to decode, so assuming it turns a UTF-8 export into `TTV GrÃŒn-WeiÃ Daseburg` and reports success.
- [x] T005 Parse the Tabellen shape in `roster-csv.ts`: `;` delimiter, header required, required columns `Region, Saison, Liga, Gruppe, VereinNr, VereinName, Altersklasse, MannschaftNr`. Read past the standings columns without storing them (FR-007) — they are zero before a season and irrelevant after, and storing them invites someone to trust them. Reject a file missing the required columns, naming what was expected (FR-006).
- [x] T006 Expose the parser to the webapp through `webapp/src/lib/raster/pipeline.ts`, alongside `parseWishesPdf` (research R-302). **Do not write a second parser in the webapp** — one format with two implementations is precisely the bug PR #10 fixed.

### Tests for the parser

> These enforce the requirements that fail silently. Write them first.

- [x] T007 [P] Unit-test the charset rule in `tests/unit/roster-csv-charset.test.ts`: the real UTF-8 export sniffs `utf-8`; the same content re-encoded as ISO-8859-15 sniffs `iso-8859-15`; both produce identical rows (SC-002); `Tischtennisverein Höxter` and `TTV Grün-Weiß Daseburg` survive each (FR-013, SC-003); a double-encoded file is refused (FR-012). Generate the ISO-8859-15 fixture from the UTF-8 one at test time rather than committing both.
- [x] T008 [P] Unit-test the parse shape in `tests/unit/roster-csv-parse.test.ts`: standings columns ignored (FR-007); a file missing required columns is rejected naming them (FR-006); an empty file, a header-only file, and a truncated file are each rejected.

**Checkpoint**: the parser is correct and provably so before anything stores what it produces.

---

## Phase 3: User Stories 1 + 2 - Import the roster, intact (Priority: P1) 🎯 MVP

**Goal**: A Tabellen export becomes canonical team identity for a scope and season, with club names intact whatever charset it was exported in.

**Independent Test**: Import the OWL 2026/27 export; verify 404 teams / 85 clubs / 43 groups with `VereinNr`, `Altersklasse`, `MannschaftNr`, Liga and Gruppe; verify `TTV Grün-Weiß Daseburg` is intact; re-import and verify nothing changes.

**Why one phase**: an importer that mangles club names is not a working importer. US2 is not a refinement of US1, it is a condition of it.

- [x] T009 [US1] Create `webapp/src/services/raster/roster.ts`: import a parsed roster for a scope and season. **Upsert** on `(rosterId, vereinNr, altersklasse, mannschaftNr)` (FR-004). Do **not** delete-and-recreate — feature 008 is currently unwinding exactly that pattern for wishes; do not plant a fresh one.
- [x] T010 [US1] Store `vereinNr` as **text** (data-model.md). It is an identifier that happens to look numeric; an integer column silently eats leading zeros, and nothing arithmetic is ever done to it.
- [x] T011 [US1] Verify the export's `Region` and `Saison` against the scope and season it is imported for, and report a mismatch rather than importing another Bezirk's teams (FR-005). Store what the *file* claimed (`sourceRegion`, `sourceSeason`) so a later mismatch is diagnosable rather than a mystery.
- [x] T012 [US1] Add the roster source type to `webapp/src/app/api/raster/sources/upload/route.ts`, gated at the `scheduler` level (contracts) — the level feature 007 establishes for work, not `admin`.
- [x] T013 [P] [US2] Record the charset used on the roster (`RasterTeamRoster.charset`). If club names are ever reported as wrong, the first question is which encoding was used; guessing twice is worse than recording once.
- [x] T014 [P] [US1] Integration-test import in `webapp/tests/integration/roster-import.test.ts`: the OWL export yields 404 teams / 85 clubs / 43 groups (SC-001); re-import changes and duplicates nothing (SC-004); a Region mismatch is reported, not imported (FR-005).
- [x] T015 [P] [US1] Integration-test identity in `webapp/tests/integration/roster-identity.test.ts`: a club renamed between two exports keeps one identity, and `vereinName` updates (FR-020, SC-005). `SC GW Paderborn` (42706) has six adult teams, so assert `vereinNr` alone does not identify a team.

**Checkpoint**: canonical identity exists. Feature 008's conflict pairing has something to anchor on.

---

## Phase 4: User Stories 3 + 4 - Collect and upload as one bundle (Priority: P2)

**Goal**: The CLI downloads the export beside the wish PDFs it already collects; the webapp takes the bundle and says what is missing.

**Independent Test**: Run the CLI for a Bezirk and season → the CSV lands beside the wish PDFs with no manual download. Zip and upload → both imported. Upload a zip with no CSV → told so, nothing imported.

- [x] T016 [US3] Create `src/raster/ingest/nuliga-export.ts`: from the **existing authenticated session**, navigate to Downloads, select "Tabellen (aktuelle Tabellen - Filter Meisterschaft)", the Meisterschaft, and the charset, then submit. `config.baseUrl` is already `…/nuLigaAdminTTDE.woa` (`src/config.ts:135-137`) and `src/auth.ts:31` already signs in there — **this is not new access, it is another page in a session that exists**.
- [x] T017 [US3] **Select the charset explicitly** rather than accepting the ISO-8859-15 default (FR-016). The CLI is standing at the dropdown; asking it to guess afterwards at what it can choose now is perverse.
- [x] T018 [US3] Poll for the download link (~5s) with a timeout (FR-015). On timeout, report what was awaited and **save nothing partial** — a truncated CSV that a later run mistakes for complete is the hazard constitution Principle IV warns about.
- [x] T018a [US3] Verify the downloaded CSV's `Region` and `Saison` match the Meisterschaft that was selected, **before saving**; discard and report a mismatch (FR-015a). Reach the export by navigating the live admin UI, never by replaying a collected URL (FR-015b). `AGENTS.md` records why, from experience: nuLiga admin URLs "contain stateful click counters and can return the wrong group/PDF when opened later or out of sequence", and a downloaded PDF must be checked against the clicked page title before being trusted. A download link is not proof of what it delivers. FR-005 catches a mismatch at import, but that is the webapp finding a mistake the CLI made, after the file has been carried around.
- [x] T019 [US3] Write the CSV into `reports/raster/clicktt-downloads/` beside the wish PDFs `scrapeSeasonModel` already collects.
- [x] T019a [US3] Zip that directory into a single bundle as the collection run's final step (FR-017, US3-AS4). Add a pure-JS zip **writer** to the CLI — Node has `zlib` but no archive writer, so this cannot be done with the standard library. Justified under Principle I in plan.md: narrowly scoped, one format, one code path, same category as the pure-JS PDF reader the constitution names. (An earlier draft avoided this dependency by leaving the admin to zip by hand; that contradicted FR-017 and was reversed — research R-303.)
- [x] T020 [US3] Wire the collection into the raster CLI (`src/raster-index.ts`), taking credentials from the environment. **No credential may reach the webapp** (FR-018, SC-011).
- [x] T021 [US4] Create `webapp/src/lib/raster/bundle.ts`: unzip, classify each file by source type, and report the result. Add the pure-JS zip reader here — inside `webapp/`, where the stack is governed separately and this is the same category as the permitted PDF reader (plan.md Constitution Check).
- [x] T022 [US4] Report what a bundle lacks (FR-019b): no CSV → say the roster is missing; no wish PDFs → say so. **Do not import what is present and stay quiet about the rest.** This is the load-bearing requirement of the story — a half-loaded scope reporting success is the same silent-success failure as the charset hazard.
- [x] T023 [US4] Report unrecognised files in a bundle rather than ignoring them (FR-019c).
- [x] T024 [US4] Keep a bare CSV upload working exactly as before (FR-019d). The bundle is an additional way in, not a replacement.
- [x] T025 [P] [US4] Integration-test the bundle in `webapp/tests/integration/roster-bundle.test.ts`: CSV + PDFs → both imported; no CSV → reported, nothing imported (SC-010); no PDFs → reported; unrecognised files → reported; a bare CSV → imports as before.

**Checkpoint**: one command collects, one upload imports, and nothing half-loads quietly.

---

## Phase 5: User Story 5 - Match parsed sources against the roster (Priority: P2)

**Goal**: A parsed club name resolves to a canonical club instead of inventing an identity from its spelling.

**Independent Test**: With the roster imported, parse a source naming `SC GW Paderborn` → resolves to 42706 rather than creating a new club.

- [x] T026 [US5] Resolve exact parsed-name matches to canonical clubs (FR-030).
- [x] T027 [US5] Offer non-matches for review against roster candidates; **never silently create a new identity** (FR-031).
- [x] T028 [US5] Leave scopes with no roster exactly as they behave today (FR-032, SC-008). **This is what keeps the feature additive** — it is why 008 can ship without this one, and why nothing already working can regress.
- [x] T029 [P] [US5] Integration-test matching in `webapp/tests/integration/roster-matching.test.ts`: exact name resolves without review (SC-006); a non-match is offered for review, not created; an unrostered scope is untouched (SC-008).

---

## Phase 6: User Story 6 - Coverage (Priority: P3)

- [x] T030 [US6] List roster teams no parsed source mentions (FR-040).
- [x] T031 [US6] List parsed teams the roster does not contain (FR-041).
- [x] T032 [US6] Add `GET /api/raster/roster` and `/api/raster/roster/coverage` at the `viewer` level, consistent with every other raster read (FR-022, contracts).
- [x] T033 [P] [US6] Integration-test coverage in `webapp/tests/integration/roster-coverage.test.ts`: uncovered roster teams are listed (SC-007); parsed teams absent from the roster are listed.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T034 Verify no club name anywhere contains `Ã` or `Â` after importing either charset (SC-003). The cheapest possible check for the feature's quietest failure.
- [x] T035 [P] Confirm no click-TT credential is referenced, held, or reachable in `webapp/` (SC-011, FR-018).
- [x] T036 [P] Walk `specs/009-nuliga-team-roster-import/quickstart.md` § "Verification against success criteria".
- [x] T037 Run `validate.ps1` (CLI half) and `webapp/validate.ps1` (webapp half) — constitution Principle VI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 decides whether the rest is verifiable against real data.
- **Foundational (Phase 2)**: the parser. BLOCKS everything — both halves depend on it.
- **US1+US2 (Phase 3)**: the MVP. One phase.
- **US3+US4 (Phase 4)**: needs Phase 3 to have something to import into.
- **US5 (Phase 5)**: needs a roster to match against.
- **US6 (Phase 6)**: needs a roster and parsed sources. Independent of Phases 4-5.
- **Polish (Phase 7)**: last.

### Feature dependency

**Depends on feature 005.** `RasterTeamRoster.scopeId` needs 005's scope-keyed model; against 004 the equivalent is a `district` string — the free-text scope-shaped string 005 exists to remove. Do not build this before 005 lands.

**Feature 008 depends on this**, softly. 008 anchors conflict pairing on the identity this supplies, but ships without it — unpaired rows surface for manual matching rather than duplicating (its FR-003a). This makes 008's review quieter; it does not unblock it.

### Within Phase 2

T003 → T004 → T005 → T006. T007 and T008 before T004/T005 land: they enforce what nothing else catches.

### Parallel Opportunities

- T002 alongside T001.
- T007, T008 — different test files, and both come first.
- T013 alongside T009–T012.
- T014, T015, T025, T029, T033 — tests across different files.
- Phase 6 (US6) alongside Phases 4-5 — it touches no collection or matching code.

---

## Parallel Example: Phase 2

```bash
# The enforcement tests are independent and come first:
Task: "Unit-test the charset rule in tests/unit/roster-csv-charset.test.ts"
Task: "Unit-test the parse shape in tests/unit/roster-csv-parse.test.ts"
```

---

## Implementation Strategy

### MVP (Phases 1–3)

Import the export; get canonical identity with names intact. That alone answers "which teams should exist in this Bezirk?", which nothing currently can, and gives feature 008 its anchor.

**STOP and VALIDATE** against SC-001, SC-002, SC-003, SC-004.

### Then

1. Phase 4 → one command collects, one upload imports.
2. Phase 5 → parsed names resolve to canonical clubs. This is where Phase 12 (T079-T082) starts shrinking.
3. Phase 6 → coverage.

---

## Notes

- **The charset is the whole risk.** A wrong choice does not throw — it succeeds and lies. T004 and T007 are the feature. Everything else is ordinary work.
- **`VereinNr` is ASCII digits**, so even a charset mistake corrupts display names and never identity. The roster stays correct while looking wrong — which is also why T034 is cheap and worth it.
- **One parser, not two** (T006). PR #10 fixed `match_duration_minutes` written three times with one differing. A CSV format with a charset rule and an identity key is more than enough surface to drift.
- **Upsert, never delete-and-recreate** (T009). 008 is unwinding that exact pattern for wishes right now.
- **T016 is not new access.** The CLI already signs into nuLiga admin — `config.ts:135-137`. The constitution question that opened this spec dissolved on contact with the code.
- **R-306 is honest that the Downloads DOM is unverified.** Selectors cannot be written from a screenshot. Expect one iteration against the real page, and use resilient locators as `auth.ts` already does.
- Commit after each task or logical group.
