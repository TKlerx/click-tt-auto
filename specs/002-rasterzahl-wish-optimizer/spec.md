# Feature Specification: Rasterzahl Wish Optimizer

**Feature Branch**: `002-rasterzahl-wish-optimizer`  
**Created**: 2026-07-07  
**Status**: Draft  
**Input**: User description: "Compute the Rasterzahlen for given PDFs, simulate how many team home-slot wishes are unfulfilled (gym over-usage), and optimize the Rasterzahl assignment across all teams in the district to minimize unfulfilled wishes — taking already-fixed higher-league Rasterzahlen as given."

## Context

In German table tennis (WTTV / click-TT), a group's season match plan is generated from a fixed round-robin template. Each team in a group holds a **Rasterzahl** — a grid position `1..N` (`N` = number of teams). Together with the template and the season's week calendar, the Rasterzahl fully determines that team's home/away pattern, including which of the alternating **home weeks** most of its home games land in.

Clubs use this to protect scarce gym (Halle) time. A club running several teams in the same hall on the same weekday wants them spread so the hall is never double-booked: some teams should play home in "week A", their sibling teams in "week B" (_im Wechsel_ / alternating), while a few explicitly want to play _zeitgleich_ (same slot, e.g. to share officials or transport). Clubs submit these wishes each season. The district game organizer (Staffelleiter) must then assign Rasterzahlen so that as few wishes as possible are broken and halls are over-used as rarely as possible.

Doing this by hand across a whole district — where a single club fields many teams across many groups, and one group's numbers are shared by teams from many clubs — is slow and error-prone. This feature builds the model from the season's inputs, scores how many wishes an assignment breaks, and searches for a better assignment.

Three realities shape the problem:

- **Only the Rasterzahl is chosen.** Each team's home weekday, hall, and start time are fixed by the club's wish and are _not_ changed by this tool. The Rasterzahl only decides which weeks the team is home. Clubs sometimes request a specific Rasterzahl, but those requests are generally ignored — most clubs do not understand what the number means.
- **Some Rasterzahlen are already fixed.** A club's top teams often play in leagues above the district (Verbands-, NRW-, Ober-, Regionalliga), where the Rasterzahl has already been assigned by another authority. Those are **given constraints**: the tool must honor them when assigning the club's remaining (district) teams, because the sibling teams' _im Wechsel_/_zeitgleich_ wishes are relative to that fixed team.
- **The rules are a published rulebook.** WTTV publishes the per-size templates, the cross-size parity tables (_korrespondierende Schlüsselzahlen rasterübergreifend_), and the week calendar (_Spielwochen_). This is the authoritative oracle for deriving, from any two Rasterzahlen, whether two teams end up home in the same week or in alternating weeks. The tool uses it rather than re-deriving the math.

Inputs can come from PDFs on disk (available today) or, preferably, be scraped from click-TT directly. The scoring and optimization are pure offline computation regardless of input source.

## Glossary

- **Rasterzahl (Schlüsselzahl)**: A team's grid position `1..N` within its group. Determines its full home/away and home-week pattern via the rulebook. The decision variable — except where already fixed.
- **Fixed Rasterzahl**: A Rasterzahl already assigned outside the district (higher leagues) that this tool must take as given and honor.
- **Raster size**: The template size used. Odd groups ride the next-even raster with the top number as a bye (7→8er, 9→10er, 11→12er, 13→14er). Six-team groups can use either the normal 6er raster or the official 6er Doppelrunde raster, selected explicitly as group mode.
- **Home week / Spielwoche A vs B**: The two alternating home-week rhythm labels from club wish PDFs. Within the same club, hall, and weekday, equal labels mean teams should be home in the same rhythm; different labels mean teams should alternate. The absolute label may flip, so A/B is relational, not a fixed calendar-week target per team.
- **im Wechsel (gegenläufig)**: A wish that two of a club's teams alternate home weeks (never home the same week) — the mechanism to avoid a hall clash.
- **zeitgleich / parallel / gemeinsam**: A wish that two of a club's teams are home the same slot on purpose.
- **Spiellokal / Halle**: A club has up to three playing venues (Halle 1/2/3). Each is a separate capacity bucket; teams state which hall they use.
- **Hall over-usage (clash)**: A (hall, weekday, week) where more of a club's teams are scheduled home than the hall's parallel capacity allows.
- **Wish**: For this tool, the operative wishes are the relational ones (_im Wechsel_ / _zeitgleich_) plus each team's fixed weekday+hall. Explicit "give team X Rasterzahl N" requests are recorded but not treated as binding.
- **District (Bezirk)**: The set of groups this Staffelleiter assigns (e.g. Bezirksoberliga and below in OWL). Optimization is joint across the whole district because groups and venues are shared.
- **Rulebook**: The WTTV reference giving per-size templates, cross-size parity tables, and the Spielwochen calendar. Static reference data.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Build a Reviewable Season Model from the Inputs (Priority: P1)

As a district game organizer, I want the tool to ingest the club wishes, the group assignment (with sizes), and the already-fixed higher-league Rasterzahlen, and turn them into one structured, human-reviewable model — so I can correct parsing mistakes before any score is trusted.

**Why this priority**: Every downstream number depends on reading messy PDFs (misaligned tables, free-text notes) correctly. The relational wishes live in free-text "Besondere Wünsche" and must be extracted with human oversight. A wrong model silently invalidates everything.

**Independent Test**: Run ingestion on the sample PDFs and verify the emitted model lists, per team: club, group, group size, home weekday(s), hall, structured week preference, and any relational wish — with every low-confidence extraction flagged for review, matching the source PDFs on manual inspection.

**Acceptance Scenarios**:

1. **Given** the club wish PDFs, **When** the tool parses them, **Then** it emits a structured record per team (club, home weekday, hall, start time, any Spielwoche A/B preference) plus each club's free-text notes.
2. **Given** free-text "Besondere Wünsche" such as "1. und 2. Mannschaft im Wechsel" or "1. und 2. parallel", **When** the tool parses them, **Then** it extracts candidate relational wishes (team pair → alternate/same) and marks each as auto-extracted pending human confirmation.
3. **Given** the group-assignment input, **When** the tool ingests it, **Then** each team is linked to its group and group size, and teams in higher (non-district) leagues are marked as carrying a fixed Rasterzahl with its value.
4. **Given** any field that cannot be confidently extracted, **When** ingestion runs, **Then** the tool flags that entry for manual review rather than guessing, and the whole model can be exported and edited before scoring.

---

### User Story 2 - Score an Assignment: Count Unfulfilled Wishes & Hall Over-usage (Priority: P1)

As a district game organizer, I want to feed in a Rasterzahl assignment and get an exact count of broken wishes and hall over-usages across the district — honoring the fixed higher-league Rasterzahlen — so I can measure how good the current or a proposed assignment is.

**Why this priority**: This is the scoring foundation. Optimization is meaningless without a trusted scorer, and a correct scorer is already useful on its own for evaluating a hand-made assignment.

**Independent Test**: Provide the reviewed model plus a fixed Rasterzahl-per-team assignment and verify the tool derives each team's home weeks via the rulebook and reports counts of hall over-usages and broken relational wishes that match a hand-computed reference.

**Acceptance Scenarios**:

1. **Given** a reviewed model and a Rasterzahl assignment, **When** the tool runs, **Then** for each team it derives the home weeks from Rasterzahl + group size + rulebook, including the correct handling of byes and the away half of the season.
2. **Given** two teams of one club sharing a hall and weekday whose Rasterzahlen put them home in the same week beyond hall capacity, **When** the tool runs, **Then** it reports that (hall, weekday, week) as a hall over-usage.
3. **Given** an _im Wechsel_ wish for a team pair whose assigned Rasterzahlen do not alternate, **When** the tool runs, **Then** it reports that wish as unfulfilled with the reason; likewise a _zeitgleich_ wish whose pair does not coincide.
4. **Given** a district team whose sibling plays in a higher league with a fixed Rasterzahl, **When** scoring the sibling relationship, **Then** the fixed Rasterzahl is used as-is (via the cross-size parity table) and never treated as changeable.
5. **Given** a completed run, **When** it finishes, **Then** the tool prints a summary (total teams, wishes fulfilled/unfulfilled/unfulfillable/unknown with per-team reasons, hall over-usages with hall+slot) and writes a machine-readable report.

---

### User Story 3 - Optimize the District Assignment (Priority: P2)

As a district game organizer, I want the tool to search Rasterzahl assignments across all district groups at once — holding fixed Rasterzahlen constant — to minimize broken wishes and hall over-usage, so I get a concrete recommended assignment, not just a score.

**Why this priority**: The payoff, but it depends entirely on the P1 scorer being correct and is additive on top of it.

**Independent Test**: Run the optimizer on a district dataset where a better assignment is known; verify the result has a total penalty ≤ the input assignment, that every district group is a valid permutation of `1..N`, that all fixed Rasterzahlen are unchanged, and that before/after scores are reported.

**Acceptance Scenarios**:

1. **Given** the reviewed model, **When** the optimizer runs, **Then** it outputs a Rasterzahl for every assignable district team such that each group is a valid permutation of `1..N` and no fixed Rasterzahl is altered.
2. **Given** a starting assignment, **When** the optimizer finishes, **Then** it reports the objective before and after and never returns an assignment worse than the start.
3. **Given** wishes that cannot all be satisfied, **When** the optimizer runs, **Then** it returns the least-bad assignment found and lists which wishes remain unfulfilled and why.
4. **Given** the organizer pins additional teams to specific Rasterzahlen, **When** the optimizer runs, **Then** it honors those pins alongside the higher-league fixed ones and permutes only the rest.

---

### User Story 4 - Ingest Directly from click-TT (Priority: P3)

As a district game organizer, I want the tool to pull the wishes and group assignment directly from click-TT instead of me exporting PDFs — so the model is always current and I skip the manual export step.

**Why this priority**: A convenience/quality improvement over PDF ingestion. The PDF path already delivers a working MVP, and scraping couples the feature to the (brittle) click-TT UI, so it is deferred.

**Independent Test**: With valid credentials, run in click-TT mode and verify the produced model matches the same season's PDF exports for the same groups.

**Acceptance Scenarios**:

1. **Given** valid click-TT credentials, **When** the tool runs in scrape mode, **Then** it collects the same team/wish/group data the PDFs provide, reusing the existing login flow.
2. **Given** click-TT is unreachable or its structure is unexpected, **When** scraping fails, **Then** the tool reports the failure clearly and the PDF path remains available as a fallback.

---

### Edge Cases

- **Odd group size / bye**: A 7/9/11/13-team group rides the 8er/10er/12er/14er raster with the top number as a bye; a team on a bye week is not counted home.
- **Multi-hall clubs**: Teams in Halle 1 vs Halle 2 of the same club do not clash even in the same week; hall identity is part of the slot key.
- **Team home only every other matchday**: Home weeks come from the rulebook, not an assumption of strict alternation.
- **Fixed sibling in a different-size group**: The _im Wechsel_/_zeitgleich_ relationship must be evaluated across raster sizes via the cross-size parity table, not by comparing raw Rasterzahlen. Likewise, hall over-usage between two same-club teams in different-size groups must compare their home matchdays on the shared district calendar week (Spielwochen alignment), not each group's local matchday index.
- **Conflicting wishes**: Two teams both wired _zeitgleich_ to a third, or an _im Wechsel_ pair that a group permutation cannot satisfy given other fixed numbers — the tool must count the unavoidable break, not hide it.
- **Explicit Rasterzahl request**: Recorded but non-binding; the tool must not fail a wish just because a club's requested number was not used.
- **Calendar-week restriction**: The operative calendar concept in v1 is the Spielwoche A/B rhythm relation within one club/hall/weekday, scored as a soft penalty when configured. More absolute constraints (even/odd Kalenderwoche, specific Punktspieltage) are captured and reported but not optimized against in v1.
- **Same-club derby in one group**: Two teams of one club in the same group must meet head-to-head by Spieltag 3 (fallback 4). The chosen Rasterzahl pair fixes that matchday, so this couples with their _im Wechsel_/_zeitgleich_ wish and can over-constrain the pair; the tool must report when both cannot be honored.
- **Second half (Rückrunde)**: Home/away swap in the second half; home-week derivation must cover the full season.
- **Missing hall capacity**: Default to 1 home match per hall per slot and note that the default was applied.
- **Group size outside supported rulebook sizes**: If a district group is not one of the supported sizes/modes (6er, 6er Doppelrunde, 7/8er, 9/10er, 11/12er, 13/14er), the tool refuses to score it rather than guessing a template.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST ingest club wishes and produce a structured per-team record: club, home weekday(s), hall, start time, any structured Spielwoche A/B preference, and the club's free-text notes.
- **FR-002**: System MUST extract relational wishes (_im Wechsel_ = alternate, _zeitgleich_/parallel/gemeinsam = same) from the free-text "Besondere Wünsche", associating each with the team pair it concerns, and mark each as auto-extracted pending human confirmation.
- **FR-003**: System MUST emit the full season model as an inspectable, editable artifact, and MUST flag every field it could not confidently extract for manual review rather than guessing.
- **FR-004**: System MUST ingest the group assignment, linking each team to its group and group size, and MUST identify teams whose Rasterzahl is fixed by a higher league together with that fixed value.
- **FR-005**: System MUST load the WTTV rulebook (per-size templates for 6er, 6er Doppelrunde, 8er, 10er, 12er, 14er; cross-size parity tables where published; and the Spielwochen calendar) as the authority for deriving home weeks and same-week/alternating-week relationships.
- **FR-006**: System MUST derive, for a given Rasterzahl assignment, each team's set of home weeks (weekday fixed by the wish), correctly handling odd-size byes and the second half of the season.
- **FR-007**: System MUST determine hall over-usage per (club-hall, weekday, week) by counting home teams against that hall's parallel capacity (default 1, noting when the default was applied). The "week" MUST be a **shared district calendar week** (Spielwoche), so that two same-club teams in groups of _different_ raster sizes sharing one hall are compared on the same weeks — the Spielwochen table aligns each size's matchdays to that common week index.
- **FR-008**: System MUST classify each relational wish as fulfilled, unfulfilled, unfulfillable, or unknown, with a concrete reason for anything not fulfilled, evaluating cross-size pairs via the parity table.
- **FR-009**: System MUST honor fixed (higher-league) Rasterzahlen as hard constraints in both scoring and optimization, never altering them.
- **FR-010**: System MUST treat the whole district as one problem — wishes and over-usage counted across all groups and clubs together — because group numbers and club venues are shared.
- **FR-011**: System MUST support scoring a supplied Rasterzahl assignment without modifying it (the P1 measurement), producing a human-readable stdout summary and a machine-readable report with per-team wish status and per-hall over-usage detail.
- **FR-012**: System MUST support an optimization mode that searches assignments to minimize the objective, subject to each district group being a valid permutation of `1..N` and all fixed/pinned Rasterzahlen held constant.
- **FR-013**: System MUST, in optimization mode, report the objective before and after and MUST never output an assignment scoring worse than a supplied starting assignment.
- **FR-014**: System MUST allow the organizer to pin additional teams to specific Rasterzahlen and permute only the rest.
- **FR-015**: System MUST record explicit club Rasterzahl requests in the model but MUST NOT treat them as binding wishes for scoring or optimization.
- **FR-016**: System MUST support PDF-file ingestion for all inputs (wishes, group assignment, fixed Rasterzahlen) as the guaranteed input path, independent of any live system.
- **FR-017**: System SHOULD support ingesting wishes and group assignment directly from click-TT, reusing the existing authenticated navigation, with PDF ingestion remaining available as a fallback. (Priority P3.)
- **FR-018**: System MUST compute the objective as a weighted sum over penalty types (hall over-usage, broken _im Wechsel_ wish, broken _zeitgleich_ wish, Spieltag-4 same-club derby fallback, broken Spielwoche A/B preference), with the weight per type supplied by the organizer via configuration so the trade-off can be tuned per season.
- **FR-022**: System MUST support per-team Spielwoche A/B rhythm hints and score them relationally within the same club/hall/weekday: equal hints prefer _zeitgleich_, different hints prefer _im Wechsel_. Missing A/B MUST be treated as flexible reviewable data, not as a validation blocker and not as an automatic soft penalty.
- **FR-023**: System MUST capture absolute calendar constraints beyond A/B parity (e.g. even/odd Kalenderwoche, specific-Punktspieltag availability) into the model and surface them in the report, but is NOT required to optimize against them in v1.
- **FR-019**: System MUST refuse to score a district group whose size is not a supported raster size, rather than assuming a template.
- **FR-020**: When two teams of the same club are in the same group, System MUST assign their Rasterzahlen so their head-to-head match falls on Spieltag 3 or earlier (derived from the template). Spieltag 4 is permitted with a high configurable penalty; a head-to-head later than Spieltag 4 is a hard-constraint violation the tool MUST report.
- **FR-021**: System MUST treat the rulebook as a fixed, pre-encoded constant (never re-parsed per run), while all yearly inputs (wishes, group assignment, fixed Rasterzahlen) are re-ingested each season.
- **FR-024**: System MUST support six-team groups in both official modes: normal 6er full-season schedule and 6er Doppelrunde as a ten-matchday half-season schedule. The selected mode is part of the reviewed `Group` input and changes template lookup, home-week derivation, derby matchday derivation, and optimization. For 6er Doppelrunde, the system MUST NOT synthesize an additional Rückrunde because Rasterzahlen are reassigned in the mid-season break.

### Key Entities _(include if feature involves data)_

- **Club**: Fields multiple teams; owns up to three halls; carries the free-text notes.
- **Team**: Belongs to a club and one group; has a fixed home weekday, hall, start time, and a wish. Its Rasterzahl is either assignable or fixed (higher league).
- **Group**: `N` teams under a template of the matching raster size/mode; its assignable Rasterzahlen form a permutation of `1..N` minus any fixed values.
- **Hall (Spiellokal)**: A club venue with a parallel capacity; the slot key includes it.
- **Relational wish**: A club-internal team pair with a desired relation (alternate / same); the operative optimization target.
- **Fixed Rasterzahl**: A higher-league team's given number, a hard constraint.
- **Rulebook**: Per-size templates, cross-size parity tables, Spielwochen calendar. Permanent constant, encoded once.
- **Same-club derby constraint**: For two same-club teams in one group, their head-to-head Spieltag must be ≤3 (≤4 fallback).
- **Rasterzahl assignment**: Team → Rasterzahl; the decision variable.
- **Evaluation result**: Counts of fulfilled/unfulfilled/unfulfillable/unknown wishes and hall over-usages, with per-team and per-hall detail, and before/after objective in optimize mode.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For a sample group with a known assignment, the tool's derived home weeks (per team) match a hand-verified reference with 100% accuracy, including bye handling.
- **SC-002**: The counts of unfulfilled wishes and hall over-usages the tool reports for a supplied assignment match a hand-computed reference on the sample dataset exactly.
- **SC-003**: Cross-size relationships (e.g. a district team vs a fixed higher-league sibling) are classified as alternating/same in agreement with the rulebook's cross-size parity table on every sampled pair.
- **SC-004**: The optimizer's proposed assignment has total penalty ≤ the supplied starting assignment on every run (never worse) and always honors fixed/pinned Rasterzahlen, per-group permutation validity, and the same-club derby constraint (head-to-head ≤ Spieltag 4).
- **SC-005**: On a real district dataset, the optimizer reduces hall over-usages and broken wishes by a measurable margin versus the naive/current assignment, or proves the input already optimal for the given constraints.
- **SC-006**: Parsed wishes and group data for the sample PDFs match the sources on manual review, with every low-confidence extraction flagged rather than silently accepted.
- **SC-007**: A full district run produces a valid, correctly-scored assignment regardless of runtime — there is no hard time ceiling, so exact/exhaustive search is acceptable and correctness/optimality is preferred over speed.

## Clarifications

### Session 2026-07-07

- Q: How should the objective weigh a broken relational wish vs. a hall over-usage? → A: User-supplied weights per penalty type (over-usage, im Wechsel, zeitgleich, Spielwoche A/B), configurable per season. (FR-018)
- Q: How are absolute calendar constraints handled in v1? → A: The operative concept is the Spielwoche A/B rhythm relation inside the same club/hall/weekday, scored as a soft penalty when configured. The absolute A/B label may flip; missing A/B is flexible. More absolute constraints (even/odd Kalenderwoche, specific Punktspieltage) are captured and reported but not optimized in v1. (FR-022, FR-023)
- Q: What is the acceptable runtime for a full district run? → A: No hard limit; correctness/optimality is preferred over speed, so exact/exhaustive search is acceptable. (SC-007)
- Q: Does the rulebook change? → A: No — `Rasterzahlen_OWL_komplett.pdf` is permanent and encoded once as a constant; only the yearly PDFs (wishes, group assignment, fixed Rasterzahlen) are re-ingested. (FR-021)
- Q: Extra hard constraint? → A: Two same-club teams in one group must meet head-to-head by Spieltag 3 (fallback 4). (FR-020)

## Assumptions

- The WTTV rulebook (templates, cross-size parity tables, Spielwochen) is a permanent constant derived once from `Rasterzahlen_OWL_komplett.pdf` and encoded into the tool — never re-parsed per run. All other PDFs (wishes, group assignment, fixed Rasterzahlen) change yearly and are re-ingested each season.
- Only Rasterzahlen are chosen. Weekday, hall, and start time are fixed inputs from each club's wish.
- Groups of size 6–14 are in scope when the corresponding official rulebook template is encoded. Seven-team groups ride the 8er raster with the top number as a bye; six-team groups require an explicit normal-vs-Doppelrunde mode.
- Each hall hosts at most one league match per slot unless a capacity override is provided.
- The district is provided as a single batch, since optimization is joint.
- Higher-league Rasterzahlen come pre-assigned (e.g. from `Gruppen-und-Raster-2026.pdf`) and are immutable inputs.
- Free-text relational wishes require human confirmation; the tool assists extraction but does not silently trust its own parse.
- This feature intentionally extends the project beyond the "single-purpose match-approval CLI" of the constitution. It reuses the CLI/report conventions and (optionally) the click-TT login, but its scoring/optimization core is independent offline computation. This scope expansion is acknowledged and accepted for this feature.
- Runs on Windows / Node LTS like the rest of the project.

## Dependencies

- Sample inputs already provided in `data/`: `Rasterzahlen_OWL_komplett.pdf` (rulebook), `Terminmeldung_gesamt_{bol,1bl1,1bl2}.pdf` (wishes), `Gruppen-und-Raster-2026.pdf` (group assignment + fixed Rasterzahlen), `*ScheduleReportFOP.pdf` (generated Spielpläne, useful for validation).
- A hand-computed reference for at least one district group, to validate SC-001/SC-002/SC-003.
- For FR-017 (P3): access to the click-TT admin area with the existing credentials and navigation.
