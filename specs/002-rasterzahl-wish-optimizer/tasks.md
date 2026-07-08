# Tasks: Rasterzahl Wish Optimizer

**Input**: Design documents from `specs/002-rasterzahl-wish-optimizer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli.md

**Tests**: Included for the rulebook decode and scorer (safety-critical: SC-001/002/003) and for the PDF parsers. Optimizer gets a correctness/monotonicity test.

**Organization**: Grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US4)
- Exact file paths included

---

## Phase 0: Pre-implementation

- [X] T001 Confirm constitution v2.0.0 amendment is in place (`.specify/memory/constitution.md`) — done 2026-07-07; no code impact, gate only.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T002 Add `raster` script to `package.json` (`"raster": "tsx src/raster-index.ts"` or ts-node equivalent, matching existing `approve`)
- [X] T003 Install dependency `pdfjs-dist`; add to `package.json`; verify pure-JS (no native postinstall)
- [X] T004 [P] Create `src/raster/` folder structure per plan.md (rulebook/, ingest/, score/, optimize/, report/) with index barrels
- [X] T005 [P] Add `reports/raster/` to `.gitignore`
- [X] T006 Create `src/raster/types.ts` — all types from data-model.md (RasterSize, Template, DerivedRaster, CrossSize, Club, Venue, Team, Group, RelationalWish, SeasonModel, Assignment, Weights, EvaluationResult, OverUsage, HardViolation, WishResult, WeekSlot, Weekday, PairKey)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The encoded rulebook + scorer primitives that US2/US3 depend on. **BLOCKS all user stories.**

- [X] T007 Encode `src/raster/rulebook/templates.json` — the 10er/12er/14er home/away grids transcribed from `Rasterzahlen_OWL_komplett.pdf` (home = left number per Spieltag). Use the verified 12er grid in research.md §3 as the reference format.
- [X] T008 Encode `src/raster/rulebook/spielwochen.json` — Spieltag → **shared district calendar week index** per size (PDF p.16). The week scale MUST be common across sizes so a 12er and a 10er team map to the same real week; verify a known cross-size alignment from p.16 in T010. Also encode `cross-size.json` — korrespondierende Schlüsselzahlen im Wechsel / zeitgleich (PDF pp.13–15)
- [X] T009 Implement `src/raster/rulebook/rulebook.ts` — typed loader; build `DerivedRaster` per size (homeSpieltage, derbySpieltag, homeWeeks); lookups: `homeWeeks(size, rz)`, `derbySpieltag(size, a, b)`, `relation(sizeA, rzA, sizeB, rzB) → wechsel|zeitgleich|neither`
- [X] T010 [P] Test `tests/unit/rulebook.test.ts` — for each size, decoded `DerivedRaster` MUST reproduce the PDF's published Gegenläufige pairs and same-club (gemeinsam/wechsel) pairs. Encode the research.md §3 12er expectations as fixtures (all 6 gegenläufig pairs, 6-7 & 1-12 gemeinsam + derby ST1).
- [X] T011 Implement `src/raster/score/derive.ts` — (Rasterzahl, size) → home-Spieltag set → home-week set expressed in **shared district calendar weeks** (via spielwochen.json), so home weeks of different-size groups are directly comparable; odd-size bye handling (top number spielfrei); second-half (Rückrunde) home/away swap
- [X] T012 [P] Test `tests/unit/derive.test.ts` — home-week sets per Rasterzahl match research.md §3 table; bye handling for 9/11/13.

**Checkpoint**: Rulebook encoded + verified; scorer primitives exist.

---

## Phase 3: User Story 1 — Build Reviewable Season Model (Priority: P1) 🎯 MVP-A

**Goal**: Ingest wishes + groups + fixed Rasterzahlen into an editable `SeasonModel` with low-confidence fields flagged.

**Independent Test**: Run `raster ingest` on the sample PDFs; the emitted model matches the PDFs on manual review, every uncertain field flagged.

- [X] T013 [US1] Implement `src/raster/ingest/wishes-pdf.ts` — extract text via pdfjs-dist; per club: name+id, venues (Spiellokal 1–3), per-team weekday+time+hall table, structured Spielwoche A/B; emit `Team` + `Club` records; flag misaligned/ambiguous rows `confidence:"review"`
- [X] T014 [P] [US1] Implement `src/raster/ingest/wishes-freetext.ts` — rule-based extraction of relational wishes from "Besondere Wünsche" (im Wechsel/Wochenwechsel → wechsel; zeitgleich/parallel/gemeinsam/gleiches Wochenende → zeitgleich; map "1. und 2. Mannschaft" → team labels). All results `confidence:"review"`. Record explicit "Rasterzahl N" as non-binding `requestedRasterzahl`.
- [X] T015 [P] [US1] Implement `src/raster/ingest/groups-pdf.ts` — parse `Gruppen-und-Raster-2026.pdf`: per higher league, team number = fixed Rasterzahl; mark those teams `rasterzahl:{kind:"fixed"}`; parse absolute-constraint notes into `AbsoluteConstraint`
- [X] T016 [US1] Implement `src/raster/ingest/model.ts` — assemble `SeasonModel`; link teams↔clubs↔groups; resolve group sizes → raster size; collect `warnings`; validate structural sanity (each group size 9–14; permutation feasibility given fixed numbers)
- [X] T017 [US1] Wire `raster ingest` command in `src/raster-index.ts` per contracts/cli.md (`--wishes`, `--groups`, `--out`); stdout summary lists every `review` field + warnings; non-zero exit on unparseable required input
- [X] T018 [P] [US1] Test `tests/unit/ingest.test.ts` — parse sample `Terminmeldung_gesamt_bol.pdf` + `Gruppen-und-Raster-2026.pdf`; assert known clubs/teams/venues/fixed-Rasterzahlen extracted; assert a known free-text wish (e.g. Alfen "Herren II/IV im Wochenwechsel") produces a `wechsel` relation flagged for review

**Checkpoint**: `raster ingest` produces a reviewable model from the sample PDFs.

---

## Phase 4: User Story 2 — Score an Assignment (Priority: P1) 🎯 MVP-B

**Goal**: Score a given assignment for hall over-usage + broken wishes across the district, honoring fixed Rasterzahlen.

**Independent Test**: Feed a reviewed model + assignment (fixture); counts match a hand-computed reference.

- [X] T019 [US2] Implement `src/raster/score/penalties.ts` — per penalty type: hall over-usage per (clubId, hall, weekday, week) vs capacity (default 1); im Wechsel / zeitgleich via `rulebook.relation`; Spielwoche A/B miss; each returns detail objects
- [X] T020 [US2] Implement `src/raster/score/evaluate.ts` — assemble `EvaluationResult`: weighted objective (Weights), hard-violation detection (permutation, fixed-altered, derby-late), per-group validity; classify each wish fulfilled/unfulfilled/unfulfillable/unknown with reason. **Guard (FR-019)**: refuse to score any group whose size is not a supported raster size (10/12/14, incl. 9/11/13 mappings) with a clear error rather than guessing.
- [X] T021 [US2] Implement `src/raster/report/reporter.ts` — stdout summary + JSON `EvaluationResult` to `reports/raster/` per contracts/cli.md
- [X] T022 [US2] Wire `raster score` command in `src/raster-index.ts` (`--model`, `--assignment`, `--weights`, `--report`); does not mutate inputs
- [X] T023 [US2] Build hand-computed reference: `tests/fixtures/raster/reference-group.json` (model + assignment + expected counts) for one 12er group derived from research.md
- [X] T024 [US2] Test `tests/unit/penalties.test.ts` + `tests/unit/evaluate.test.ts` — each penalty type on crafted cases; end-to-end score of the reference group matches expected counts exactly (SC-002); cross-size sibling relation matches the parity table (SC-003); **cross-size hall over-usage case** — two same-club teams in a 12er and a 10er group sharing one hall+weekday whose Spielwochen-aligned home weeks collide is flagged as over-usage (guards F1)

**Checkpoint**: `raster score` gives correct, hand-verified counts. **MVP (US1+US2) complete.**

---

## Phase 5: User Story 3 — Optimize the District Assignment (Priority: P2)

**Goal**: Search for a minimal-penalty assignment; honor fixed/pinned + permutation + derby ≤ST4.

**Independent Test**: On a dataset with a known-better assignment, result penalty ≤ start; all hard constraints held; before/after reported.

- [X] T025 [US3] Implement `src/raster/optimize/components.ts` — build the coupling graph (group-permutation edges + club relational-wish edges) and split into independent components
- [X] T026 [US3] Implement `src/raster/optimize/search.ts` — per component: branch-and-bound (exact; prune on partial permutation + derby feasibility) with simulated-annealing fallback for large components; never returns worse than `--start`; enforces fixed/pinned Rasterzahlen and permutation validity
- [X] T027 [US3] Wire `raster optimize` command in `src/raster-index.ts` (`--model`, `--weights`, `--start`, `--pin`, `--out`, `--report`); output proposal + before/after evaluation
- [X] T028 [P] [US3] Test `tests/unit/optimize.test.ts` — (a) monotonicity: result ≤ start on random seeds (SC-004); (b) all hard constraints held (fixed/pinned/permutation/derby ≤ST4); (c) small hand-solvable instance reaches the known optimum; (d) **strict-improvement case (SC-005)**: a crafted instance whose start has known over-usages and a known strictly-better assignment — assert the optimizer's result penalty is strictly lower than the start

**Checkpoint**: `raster optimize` proposes valid, improved assignments.

---

## Phase 6: User Story 4 — Ingest from click-TT (Priority: P3)

**Goal**: Pull wishes + groups from click-TT instead of PDFs, producing the same `SeasonModel`.

**Independent Test**: Scrape mode output matches the PDF-export model for the same groups.

- [X] T029 [US4] Implement `src/raster/ingest/scrape.ts` — reuse `src/auth.ts` + `src/navigation.ts`; collect wishes + group assignment; map to the same intermediate structures as the PDF parsers
- [X] T030 [US4] Add `--from-clicktt` flag to `raster ingest`; clear failure + PDF fallback when click-TT is unreachable/unexpected

**Checkpoint**: Optional live ingestion works; PDF path remains default.

---

## Phase 7: Polish & Cross-Cutting

- [X] T031 [P] Update `README.md` — document the `raster` subcommand family (ingest/score/optimize), inputs, and the review step
- [X] T032 [P] Add default `weights.json` example + document tuning in quickstart
- [X] T033 Run `pwsh -File ./validate.ps1` (typecheck + lint + test) clean
- [X] T034 Run `specs/002-rasterzahl-wish-optimizer/quickstart.md` end-to-end on the sample PDFs; capture a real proposal in `reports/raster/`
- [X] T035 Update `specs/OVERVIEW.md` status as phases complete

---

## Dependencies & Execution Order

- **Phase 1 Setup** → **Phase 2 Foundational** (rulebook + derive) blocks everything.
- **US1 (Phase 3)** and **US2 (Phase 4)** are both P1 and independently testable: US2 uses a fixture model (T023), so it does not require US1 to run. Ship both for the MVP.
- **US3 (Phase 5)** depends on US2's scorer (evaluate/penalties).
- **US4 (Phase 6)** depends on US1's model assembly; optional.
- **Polish (Phase 7)** last.

### Parallel Opportunities

- T004/T005 setup; T010/T012 tests; T014/T015 parsers (different files); T018 test; T028 test — all [P].
- After Phase 2, US1 and US2 can proceed in parallel (US2 via fixtures).

## Implementation Strategy

- **MVP** = Phases 1–4 (Setup + Foundational + US1 ingest + US2 score). Delivers: parse the season, review it, and get exact broken-wish / over-usage counts for any assignment.
- Then US3 (optimize) for the payoff, US4 (scrape) as convenience.

## Notes

- Rulebook encoding (T007/T008) is the critical-accuracy task — validate each size against its published tables (T010) exactly as research.md did for 12er before trusting any score.
- Commit after each task or logical group; keep `validate.ps1` green.
