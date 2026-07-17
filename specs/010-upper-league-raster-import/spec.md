# Feature Specification: Upper-League Raster Import

**Feature Branch**: `010-upper-league-raster-import`  
**Created**: 2026-07-17  
**Status**: Draft  
**Input**: User description: "we need this gruppen pdf also in the webapp... But we also need to make sure that the rasterzahl from the WTTV / Verbandsliga is taken and occupies one hall capacity on every match day of those WTTV / verbandsliga teams. If that is not the case at the moment, we need to really fix that."

**Raised from**: review of feature 006 (combined WTTV planning), 2026-07-17. Asking why combined runs behave no differently from single-scope ones turned up the reason: the constraint 006 exists to remove is not applied in the webapp at all.

**Terminology**: "Upper league" means a WTTV-level competition — Regionalliga, Oberliga, NRW-Liga, Verbandsliga, Landesliga. A club's teams are spread across those and its own Bezirk's leagues. "Rasterzahl" is a team's number within its group; it fixes which weeks the team plays at home.

## Context: the constraint that was never applied

Feature 003 describes a Bezirk run as respecting "the fixed upper-league Rasterzahlen and hall capacities as constraints", and feature 006 is built on the same premise:

> "A Bezirk's input set takes the Verband's **already-decided** upper-league Rasterzahlen as fixed hard constraints... Combined planning removes that ordering."

In the webapp this does not happen. Established during the 006 review:

- `buildSeasonModelFromAssignments` is called with one argument, so its `fixedRows` parameter defaults to empty and **every team is `{kind: "assignable"}`**.
- `RasterFixedRasterzahl` rows are uploaded, stored, counted and shown on the review page, and **never reach the solver**. Nothing in `webapp/src` writes `kind: "fixed"` or `kind: "pinned"` onto a model team.
- `parseGroupsPdf`, which reads the published Rasterzahlen, **is not exposed to the webapp**: it appears in neither `pipeline.ts` nor the ingest `index.ts`.
- A Bezirk's model is built from that Bezirk's scraped group assignments, which contain no upper-league teams. `RasterFixedRasterzahl` is only `(clubId, teamLabel, rasterzahl)`, so it can mark an existing team fixed but cannot add one.

So a Bezirk plan cannot see that a club's 1st team already occupies the club's hall on its Verbandsliga home evenings. It may put the 2nd team in the same hall, same weekday, same week.

The capability exists in the CLI: `buildSeasonModel(wishPaths, groupsPath)` applies `parsedGroups.fixed`, and `data/upper-fixed.csv` supplies the upper-league teams. The webapp never got it. This feature is that gap.

**This is a prerequisite for 006 meaning anything.** FR-013 of 006 promises that a combined run "decides upper-league Rasterzahlen rather than accepting them as fixed input" — but the webapp accepts them as nothing, so combined and single-scope runs currently grant the optimizer identical freedom. 006's benefit only becomes visible once the constraint it removes is real.

## Context: where the numbers come from

At WTTV level a human planner assigns the Rasterzahlen and publishes them:
`https://nrw-tischtennis.de/wp-content/uploads/2026/06/Gruppen-und-Raster-2026.pdf`

That document is the authority. It is not click-TT data and is not derivable from click-TT:

- The scraped `Rang` column is the **live standings rank**, not the Rasterzahl. The two coincide only before any match is played. The webapp discards the scraped value anyway, so nothing depends on it today.
- The nuLiga Tabellen CSV export covers one Bezirk's own competition and contains no upper-league rows at all. Its `Rang` is likewise the live rank.

The PDF is committed as a fixture at `tests/fixtures/raster/gruppen-und-raster-2026.pdf` (PR #22). Its layout is regular:

```
Verbandsliga 1 Erwachsene
1   Jugend 70 Merfeld       Sa. 17.30 Uhr
...
5   TuRa Elsen              Sa. 17.30 Uhr
```

A league heading, then one entry per Rasterzahl: leading number, team, home day and start time. `xxx` marks a vacant slot so the numbering stays continuous.

`data/upper-fixed.csv` is the same information transcribed by hand for the CLI, which makes it an **independent oracle**: it says `Verbandsliga 1 Erwachsene, TuRa Elsen, 5`, and the PDF says `5   TuRa Elsen` under that heading. PR #22 asserts all ten of its rows appear in the document.

## Context: the existing parser cannot be reused

`parseGroupsPdf` exists but does not parse this document. Measured against the fixture it scores **0/10**:

```
TuRa Elsen        want=5  got=27
DJK Adler Brakel  want=4  got=27
SV Menne          want=4  got=27
groups invented: Unknown/Review Group 1(size 6)
```

Every team returns 27 — the year, taken from the title "Spielzeit 2026/27". The parser matches on `team.label` ("Erwachsene", "Damen"), which occurs in every league heading, then takes the nearest 1–2 digit number. It also never reads groups from the document: it derives group sizes from `teams.length` and fills them by array order. Its own warning concedes it is "best-effort".

The extracted text is one blob with almost no newlines, which is why its `[^\n]{0,80}` proximity rule reaches across teams and leagues.

This feature therefore **writes a parser**; it does not expose the existing one. The contract test is already in the repo, skipped, at `tests/unit/groups-pdf.test.ts`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Bezirk plan respects the upper leagues (Priority: P1)

A scheduler plans their Bezirk. Clubs whose teams also play at WTTV level have those teams' published Rasterzahlen honoured as fixed, and the hall those teams occupy on their home weeks is not offered to the club's Bezirk teams.

**Why this priority**: This is the feature. Without it a plan can double-book a hall — the failure the Rasterzahl system exists to prevent — and the scheduler has no way to see it coming.

**Independent Test**: Import the published PDF, run a Bezirk plan for a club with a Verbandsliga 1st team and a Bezirksliga 2nd team sharing one hall of capacity one, and verify the 2nd team never gets a Rasterzahl whose home weeks collide with the 1st team's.

**Acceptance Scenarios**:

1. **Given** the published PDF is imported, **When** a Bezirk run executes, **Then** each upper-league team of a club in that Bezirk carries its published Rasterzahl as a hard constraint.
2. **Given** such a team, **When** the run assigns Rasterzahlen, **Then** its home weeks count against its club's hall on its home weekday and start time.
3. **Given** a club whose hall fits one match, **When** its upper-league team is home in a week, **Then** no Bezirk team of that club is assigned a Rasterzahl putting it home in the same week at an overlapping time.
4. **Given** an upper-league team, **When** it is added to the model, **Then** it is not itself planned — its number is input, not output.
5. **Given** no PDF imported for the season, **When** a Bezirk run executes, **Then** it behaves as it does today and records that the upper-league numbers were absent.

---

### User Story 2 - Import the published Raster PDF (Priority: P1)

An admin uploads the season's published Gruppen-und-Raster PDF. The system parses the leagues, teams and Rasterzahlen, and shows what it found so the admin can confirm it is right before anything is planned.

**Why this priority**: Equal first, and inseparable from User Story 1 — the numbers cannot constrain anything until they can be read. Split out because it is independently valuable and testable: an admin can import and inspect without starting a run.

**Independent Test**: Upload the fixture PDF and verify the parsed result matches `data/upper-fixed.csv` on league, team and Rasterzahl for all ten rows.

**Acceptance Scenarios**:

1. **Given** the published PDF, **When** it is parsed, **Then** every entry yields its league, its team, and the leading number as that team's Rasterzahl.
2. **Given** an entry carrying a home day and start time, **When** it is parsed, **Then** both are captured.
3. **Given** a vacant slot (`xxx`), **When** it is parsed, **Then** no team is recorded for that number and the following entries keep their own numbers.
4. **Given** a club name containing digits ("1. FC Köln II", "Jugend 70 Merfeld"), **When** it is parsed, **Then** those digits are not mistaken for a Rasterzahl.
5. **Given** a parsed import, **When** the admin opens it, **Then** they can see which teams and numbers were found, for which leagues.
6. **Given** a PDF the parser cannot make sense of, **When** it is imported, **Then** it is refused with what was wrong, rather than accepted with guessed numbers.

---

### User Story 3 - Know which upper-league teams were matched (Priority: P2)

An admin can see which imported upper-league teams were matched to clubs in the scope being planned, and which published entries were left aside.

**Why this priority**: The import spans all of WTTV while a Bezirk run needs only its own clubs' teams. Dropping the rest is correct; dropping one that *should* have matched is a missing constraint — and User Story 1's failure mode is invisible in the result.

**Independent Test**: Import the PDF for a Bezirk with known upper-league teams and verify the matched teams are listed and the unmatched entries counted.

**Acceptance Scenarios**:

1. **Given** an import, **When** a Bezirk run is prepared, **Then** the admin can see which upper-league teams were attached to the model.
2. **Given** a published team whose club is not in this Bezirk, **When** the model is built, **Then** it is left out without comment.
3. **Given** a club in this Bezirk with no matching published entry, **When** the model is built, **Then** that is visible rather than indistinguishable from "has no upper-league team".

---

### Edge Cases

- A club's upper-league team has no wish, so its hall and home day are unknown. It cannot honestly occupy capacity (FR-024), and must not be silently counted as if it could. `capacityRelevant: false` makes a team keep its number and stop counting, with no error — pinned by test in PR #22.
- Two clubs in different Bezirke share a venue, so an upper-league team ought to occupy a hall outside its own Bezirk. Out of scope by decision (Q2).
- The published PDF is reissued mid-season with changed numbers, after runs already exist.
- A club's name in the PDF differs from click-TT's ("TTV Höxter" vs "Tischtennisverein Höxter").
- The PDF lists a team for a club with no teams in this Bezirk at all.
- An upper-league team's Rasterzahl exceeds the raster size of the group the model puts it in.
- A season with no published PDF yet — planning must still work.
- One club fields teams in two upper leagues (Verbandsliga and Landesliga), each with its own number and home evening.

## Requirements *(mandatory)*

### Functional Requirements

#### Reading the published PDF

- **FR-001**: The system MUST parse the published Gruppen-und-Raster PDF into leagues and, per league, one entry per Rasterzahl naming the team.
- **FR-002**: A Rasterzahl MUST be taken from its entry's leading number, never inferred from position or count.
- **FR-003**: Group membership MUST be read from the document, not derived from how many teams the caller happens to hold.
- **FR-004**: The parser MUST capture an entry's home day and start time where the document states them.
- **FR-005**: A vacant slot MUST yield no team while leaving the surrounding numbering intact.
- **FR-006**: Digits inside a club's name MUST NOT be read as a Rasterzahl.
- **FR-007**: The parser MUST refuse a document it cannot read rather than return best-effort numbers. These become hard constraints on a real plan; a wrong number is worse than no number.
- **FR-008**: The parsed result MUST agree with `data/upper-fixed.csv` on every row that file contains.

#### Importing

- **FR-010**: An admin MUST be able to import the published PDF for a season, alongside the existing sources.
- **FR-011**: The import MUST record what it parsed, so a later run uses reviewed data rather than re-parsing at run time.
- **FR-012**: Re-importing a corrected PDF MUST replace the previous import for that season.
- **FR-013**: The admin MUST be able to see what was parsed before planning against it.

#### Constraining a run

- **FR-020**: A Bezirk run MUST include, for each club in that Bezirk, that club's upper-league teams as named by the import.
- **FR-021**: Only upper-league teams of clubs in the scope being planned MUST be included (Q2 parks the shared-venue case).
- **FR-022**: An included upper-league team's Rasterzahl MUST be a hard constraint and MUST NOT be re-decided by the run.
- **FR-023**: An included upper-league team MUST occupy its club's hall on each of its home weeks, at its home day and start time, exactly as a Bezirk team does.
- **FR-024**: An upper-league team whose hall or home day is unknown MUST NOT be counted as occupying capacity, and its exclusion MUST be recorded. It must not become capacity-irrelevant silently.
- **FR-025**: An included upper-league team MUST NOT appear in the run's output as a planned assignment. It is an input.
- **FR-026**: A run started with no import for the season MUST proceed, and MUST record that the upper-league numbers were absent. Feature 006's coverage record is the place for this.
- **FR-027**: A combined run MUST continue to decide upper-league Rasterzahlen for the scopes it spans rather than take them as fixed (006 FR-013). This feature supplies the constraint that combined planning removes; it does not contradict it.

### Key Entities

- **Published raster import**: Per season, the parsed content of the association's PDF — leagues, teams, Rasterzahlen, home days and times. New. Sourced from outside click-TT and authoritative for upper-league numbers.
- **Upper-league team**: A team the run must respect but not plan: fixed number, occupies its club's hall, produces no assignment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a club with an upper-league team and a Bezirk team sharing one hall, no plan places both at home in the same week at overlapping times.
- **SC-002**: Every Rasterzahl in `data/upper-fixed.csv` is reproduced from the PDF by the parser, with no hand transcription.
- **SC-003**: An admin can tell, before starting a run, which upper-league teams will constrain it.
- **SC-004**: A run started without an import is distinguishable after the fact from one started with it.
- **SC-005**: No upper-league team appears as an assignment in a Bezirk snapshot.
- **SC-006**: A club's Bezirk plan is unchanged by this feature when the club has no upper-league teams.
- **SC-007**: A malformed or unexpected PDF never produces a run constrained by guessed numbers.

## Assumptions

- The published PDF is the authority for upper-league Rasterzahlen. Nothing derives them from click-TT: the standings `Rang` is the live rank and matches the Rasterzahl only before the season starts.
- The document's layout is stable season to season: league heading, then `<Rasterzahl>  <team>  <day>. <time> Uhr`, with `xxx` for vacant slots. If it changes, FR-007 means the import fails rather than misleads.
- Wishes exist for a club's upper-league teams where those teams matter. OWL clubs submit wishes covering their WTTV-level teams, and that is what supplies the hall and home day FR-023 depends on.
- Upper-league teams are matched to clubs by name, as everything else in the model is. Club identity is a slug of the club's name today; a real WTTV club number is reachable but unbuilt (Q4).
- Hall capacity accounting already works — established by test in PR #22: a fixed team's home weeks count against its club's hall, time-overlap aware, with teams of unknown start time counted conservatively in every bucket. This feature supplies the teams; it does not change the mechanism.
- The existing `RasterFixedRasterzahl` upload stays as the manual path. This feature neither removes it nor depends on it.

## Out of Scope

- Any change to how the optimizer decides an assignable Rasterzahl.
- Automating the download of the published PDF. An admin uploads it; it is published once a season.
- Retrofitting the constraint onto runs that already exist.
- Deciding a Bezirk's own Rasterzahlen from any published source. This feature is about the leagues above the Bezirk.
- Comparing the optimizer's output against the human planner's numbers. Separate interest, and it needs its own source for Bezirk-level manual numbers.
- Replacing name-based club identity with a real club number (Q4).

## Open Questions

- **Q1 (decide at planning)**: Where should the parsed import live — a `RasterSource` row for the scope being planned, or once per season for the whole federation? The PDF covers all of WTTV, so importing per Bezirk duplicates it thirteen times; but sources are currently scope-keyed. `sourceType` is free text, so either shape needs no migration.
- **Q2 (closed, 2026-07-17)**: Should an upper-league team occupy a hall in a Bezirk other than its club's own, where two clubs share a venue? **No.** Only that Bezirk's own clubs' upper-league teams are pulled in. The edge case is acknowledged and parked.
- **Q3 (decide at planning)**: What happens when a club's name in the PDF does not match click-TT's? Refusing the import is too strict — one unmatched club would block a season. Ignoring it silently drops a real constraint. User Story 3 makes it visible; whether it should also block a run is open.
- **Q4 (open, low)**: Should club identity move to a real club number? `clubInfoDisplay?club=8276` is reachable from public click-TT pages for the whole federation with no special permission, and the OWL Tabellen export carries `VereinNr=42608` — a third namespace. Both are exact where today's name slug is a guess. Out of scope here: this feature matches by name like everything else, and inherits whatever identity later lands.
