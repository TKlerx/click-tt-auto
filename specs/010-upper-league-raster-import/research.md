# Phase 0 Research: Upper-League Raster Import

All decisions below feed Phase 1 (data model, contracts). No open `NEEDS CLARIFICATION` remain after this pass; the spec's Q1/Q3 were settled in the clarify session and Q4 (real club number) is out of scope.

## R1 — Parsing the Gruppen-und-Raster PDF

**Decision**: Rewrite `src/raster/ingest/groups-pdf.ts`. Extract text with the existing `extractPdfText`, then parse structurally: scan for league headings (a known league-name vocabulary), and within each league read repeated entries of the shape `<Rasterzahl:1-2 digits>  <team name>  [<Sa.|So.|Fr.|…>. <HH.MM> Uhr]`, treating `xxx` as a vacant slot that consumes its number but yields no team. Emit `{ league, entries: [{ rasterzahl, team, homeWeekday?, startTime? }] }`. Throw `RasterInputInvalid`-style on a document whose structure does not match (FR-007).

**Rationale**: The extracted text is one blob with almost no newlines (measured: 4 lines, ~14.5k chars), which is exactly why the current `[^\n]{0,80}` proximity heuristic scores 0/10 — it matches the age-class label ("Erwachsene") that appears in every heading and grabs the nearest number, which is the year in the title ("Spielzeit 2026/27"). Anchoring on the *league heading* then reading each entry's *leading* number is what the layout actually supports. `data/upper-fixed.csv` is an independent oracle (all ten rows verified present in PR #22), and `tests/unit/groups-pdf.test.ts` already encodes the contract, skipped.

**Alternatives considered**: (a) keep the heuristic and tune the regex — rejected, the 0/10 failure is structural, not a tuning problem; (b) an LLM extraction pass — rejected, violates FR-007 (must refuse rather than guess) and the constitution's Azure-only LLM rule for a task a deterministic parser solves; (c) parse positional PDF coordinates via pdfjs — rejected as premature; the text layout is regular enough.

## R2 — Where an upper-league team's hall comes from

**Decision**: The PDF supplies the Rasterzahl, the league/group, and the home day + start time — but **not the hall**. The hall comes from the club's own data: the wish the club submitted for that upper-league team (which carries hall/weekday/start time), falling back to the club's venue. Injection matches a parsed upper-league entry to a club-and-team in the scope; if a matching wish/venue supplies a hall, the team is capacity-relevant; if not, it is excluded and recorded (FR-024).

**Rationale**: FR-023 requires the team to occupy *its club's hall*. The PDF is federation-wide and hall-agnostic. The spec's assumption already states OWL clubs submit wishes covering their WTTV-level teams, which is precisely the hall source. This keeps identity and hall resolution inside the existing model rather than inventing a second venue source.

**Alternatives considered**: derive hall from the PDF — rejected, it isn't there; require a separate hall upload for upper-league teams — rejected as redundant with wishes and heavier for the admin.

## R3 — Computing an upper-league team's home weeks

**Decision**: Reuse the existing home-week logic (`home_weeks_for_group` in `scripts/solve-raster-cpsat.py`, mirrored by the TS evaluator). It needs the team's group raster size and its fixed Rasterzahl. The group size comes from the parsed import (count of non-vacant entries in that league). So an injected upper-league team carries its own group (league ref + size) and a `{ kind: "fixed", value }` Rasterzahl; the solver then computes its home weeks exactly as for a Bezirk team, and those weeks count against the club's hall.

**Rationale**: This is the mechanism PR #22 proved works and is time-overlap aware. Supplying the upper-league team with a real group and fixed number means no new capacity code — the existing slot accounting picks it up.

**Alternatives considered**: precompute home weeks in TS and pass them as opaque occupied slots — rejected, it forks the home-week logic and risks drift from the solver's own computation (the same duplicated-logic hazard that bit the combined-planning group key).

## R4 — Keeping the upper-league team out of the output (FR-025)

**Decision**: Inject the upper-league team with its fixed Rasterzahl and a marker (e.g. `planned: false` / an "input-only" flag) so it constrains capacity and same-club spacing but is excluded from the persisted assignment/snapshot. Its own group is a constraint context, not a group the run is deciding.

**Rationale**: FR-025 — it is input, not output. The solver already treats `fixed` teams as constraints; the snapshot writer must skip input-only teams. This is a small, explicit filter at persistence, not a solver change.

**Alternatives considered**: give the upper-league team a real assignment row and hide it in the UI — rejected, it pollutes the snapshot and SC-005 forbids it.

## R5 — Storage and staleness (FR-011, FR-012)

**Decision**: Store the parsed import as a per-scope `RasterSource` row: `scopeId` + `season` + a new `sourceType` (e.g. `UPPER_LEAGUE_RASTER`) + `parsedJson`. Re-import deletes existing rows for that scope+season+sourceType and creates the new row in one transaction; runs started before that time are flagged stale via `sourceChangedSinceStart`, extended to cover single-scope runs.

**Rationale**: `RasterSource` is exactly the existing "a parsed thing that feeds a run" model; `sourceType` is free text so no migration (Q1). The DB unique key includes `sourceRef`, so delete-then-create is the smallest way to guarantee one active upper-league import per scope+season. The staleness signal already exists for combined planning; extending it to single-scope runs keeps FR-012 on the same UI path.

**Alternatives considered**: a bespoke per-season federation table — rejected (Q1), new shape, no scope-keying, and each Bezirk needs only its own clubs' teams anyway.

## R6 — Matching parsed entries to scope clubs (FR-011a)

**Decision**: Exact-name match against the scope's clubs (the same name identity the model already uses). A parsed entry with no exact match is omitted from injection; exact matching alone cannot prove it belongs to this Bezirk. To make scope-relevant gaps visible without fuzzy matching, compare the scope's upper-league-looking wish/team rows against exact parsed matches and record any missing ones as `unmatched` for US3. Gaps never block the import or run.

**Rationale**: The clarify session chose exact-match + flag. Fuzzy matching risks a wrong auto-match becoming a hard constraint (worse than none, per FR-007's spirit); refusing blocks a season on one odd name. Flagging scope wish gaps matches US3 without pretending every unmatched federation-wide PDF row is local.

**Alternatives considered**: reuse `closestClubId` fuzzy matching — rejected here (kept available for a later, explicitly-reviewed pass, tied to Q4's club-number work).

## R7 — Recording gaps in the coverage record (FR-024, FR-026)

**Decision**: Extend feature 006's coverage record with the upper-league facts: which teams were matched and injected, which scope wish/team rows lacked an exact published match, which matched teams were excluded for lack of a hall/home day, and whether any import existed for the season. No new gap-reporting surface.

**Rationale**: The clarify session chose the coverage record; FR-026 already routes "no import" there. One place for all gap types is consistent and testable, and the coverage record is already persisted per run.

**Alternatives considered**: a dedicated import-review view for run-time gaps — rejected as splitting gap reporting; a lightweight parsed-preview view still exists for US2/US3 *pre-run* inspection, but the run-time record is the coverage record.
