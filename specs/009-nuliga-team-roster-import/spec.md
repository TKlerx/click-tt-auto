# Feature Specification: nuLiga Team Roster Import

**Feature Branch**: `009-nuliga-team-roster-import`  
**Created**: 2026-07-15  
**Status**: Draft  
**Input**: User description: "From the parsing of all groups on the click-tt website, we know how many and which teams should be in which group. I got a new and nicer way of getting all teams in the district [the nuLiga admin Tabellen export]. So we know already how many teams should be there and where they belong to. We do not have an importer for that csv."

**Raised from**: feature `008-wish-import-conflicts` clarification, 2026-07-15. 008 anchors conflict detection on canonical team identity, which nothing currently provides.

## Clarifications

### Session 2026-07-15

- Q: Should the nuLiga admin export download be automated, and where? → A: **In the CLI**, via Playwright, alongside the wish PDFs it already downloads. `scrapeSeasonModel` (`src/raster/ingest/scrape.ts:91`) already launches Chromium with `acceptDownloads: true`, signs in with credentials from `.env`, and collects wish PDFs into `reports/raster/clicktt-downloads`. Adding the nuLiga Downloads navigation is an increment on that, not a new credential surface — the webapp stays read-only toward click-TT, and credentialed automation stays in capability 1 where the constitution puts it. With both the wish PDFs and the CSV in one directory, the last step is bundling them.
- Q: Should the webapp accept a zip of CSV + wish PDFs as one upload? → A: Yes, in this feature. The CLI produces a bundle; the webapp accepts it as a single upload. Where a bundle is incomplete — no CSV, or no wish PDFs — the system says so plainly rather than importing what it has and staying quiet about the rest.

## Context: click-TT knows the club number; nothing takes it

The click-TT scraper (`src/raster/ingest/clicktt-assignments.ts`) reads a team's **name** out of a table cell, along with its league, group and Rasterzahl. It captures no club number. Everything downstream inherits that: `splitTeamName` (`src/raster/ingest/model.ts:53`) has to regex a display string to decide whether a team is `Jugend`, `Damen` or `Erwachsene`, and the parsed-identity backlog (`specs/003-raster-review-webapp/tasks.md` Phase 12, T079-T082) exists solely because two spellings of one club cannot otherwise be recognised as the same club.

The nuLiga admin export carries what the scraper drops. A sample for OWL 2026/27 (`data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv`) holds **404 teams across 85 clubs and 43 groups in 16 Ligen**, with:

- `VereinNr` — a stable club number (`SC GW Paderborn` = 42706, `TTV Grün-Weiß Daseburg` = 42522)
- `Altersklasse` per team — `Erwachsene`, `Damen`, `Jugend 19`, `Jugend 15`, `Jugend 13`
- `MannschaftNr` — the team's number within its club and age class
- `Liga`, `Gruppe`, `Region`, `Saison`

`VereinNr` + `Altersklasse` + `MannschaftNr` is **unique across all 404 rows**.

So the alias problem is an artifact of the import path, not of the domain. click-TT knows `SC GW Paderborn` is club 42706; the scraper simply never asks. The data also shows why the problem is real: this district contains both a `SC GW Paderborn` and a `TTV Grün-Weiß Daseburg` — "GW" is an abbreviation of "Grün-Weiß", exactly the ambiguity Phase 12 exists to resolve by fuzzy matching.

**This feature is worth more than convenience.** It is expected to *shrink* Phase 12 rather than add to it, and it supplies canonical `Altersklasse`, which is what the match-duration heuristic should read instead of parsing a label.

## Context: how the export is obtained

By hand, today:

1. Sign in to nuLiga admin
2. Open **Downloads**
3. Download → **"Tabellen (aktuelle Tabellen - Filter Meisterschaft)"**
4. Meisterschaft → the Bezirk and season (e.g. "Bezirk Ostwestfalen/Lippe 2026/27")
5. Zeichensatz → character set, **defaulting to ISO-8859-15**
6. **Exportieren**, then wait for a download link to appear — roughly 5 seconds

Four things follow:

- **The export is per Meisterschaft** — one Bezirk and season at a time, matching how input sets are scoped.
- **It is generated asynchronously.** The link appears after a wait; it is not a direct download. Short, but it is a wait, not a fetch.
- **The character set is a choice with a bad default.** See below.
- **The CLI is already most of the way there.** `scrapeSeasonModel` (`src/raster/ingest/scrape.ts:91`) launches Chromium with `acceptDownloads: true`, signs in with credentials from `.env`, and downloads wish PDFs into `reports/raster/clicktt-downloads`. This flow is the same browser, the same session, and one more navigation. That is why the download belongs in the CLI (capability 1) rather than the webapp, which the constitution keeps read-only toward click-TT.

## Context: one bundle instead of many uploads

Wish PDFs already reach the CLI's download directory. Once the CSV lands beside them, a season's inputs for a scope are a single directory — so the CLI emits one bundle and the webapp takes one upload, rather than an admin uploading a CSV plus one PDF per club.

This matters most when a bundle is **incomplete**. A zip with no CSV, or with no wish PDFs, is a normal mistake — a half-finished collection, or the wrong directory. Importing what is there and staying quiet about the rest is how a scope ends up half-loaded without anyone noticing, so the system says what is missing instead.

## Context: the character set is a real hazard

The export defaults to **ISO-8859-15** and can be switched to UTF-8. The sample in `data/` happens to be UTF-8.

This matters because **ISO-8859-15 cannot fail to decode** — every byte maps to some character — so an importer that assumes it will silently produce mojibake from a UTF-8 file rather than erroring:

| Correct (UTF-8) | Misdecoded as ISO-8859-15 |
|---|---|
| `Tischtennisverein Höxter` | `Tischtennisverein HÃ¶xter` |
| `TTV Grün-Weiß Daseburg` | `TTV GrÃŒn-WeiÃ Daseburg` |
| `SSV Blau-Weiß Blankenau` | `SSV Blau-WeiÃ Blankenau` |

Umlauts are common in club names, so this is the normal case, not an edge case.

One mitigation is structural: **`VereinNr` is ASCII digits**. A charset mistake corrupts display names but never identity. That is a further argument for anchoring on the number — the system stays correct even when it looks wrong.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import the roster for a Bezirk and season (Priority: P1)

An admin exports the Tabellen file from nuLiga admin for their Bezirk and season, uploads it, and the system records every team in that Bezirk with its canonical identity and its group.

**Why this priority**: It is the feature. Everything else here refines it.

**Independent Test**: Upload the OWL 2026/27 export and verify 404 teams across 85 clubs and 43 groups are recorded, each with `VereinNr`, `Altersklasse`, `MannschaftNr`, club name, Liga and Gruppe.

**Acceptance Scenarios**:

1. **Given** a Tabellen export for a Bezirk and season, **When** an admin uploads it, **Then** every team row is recorded with its canonical identity and group.
2. **Given** an export whose rows are already recorded, **When** it is uploaded again, **Then** no team is duplicated.
3. **Given** an export for a different Bezirk than the one selected, **When** it is uploaded, **Then** the mismatch is reported rather than silently importing another Bezirk's teams.
4. **Given** an export for a different season than the input set, **When** it is uploaded, **Then** the mismatch is reported.
5. **Given** an upload that is not a Tabellen export, **When** it is processed, **Then** it is rejected with a clear message and nothing is recorded.

---

### User Story 2 - Read the file whatever character set it was exported in (Priority: P1)

Club names survive the import intact, whether the admin left the Zeichensatz at its ISO-8859-15 default or switched it to UTF-8.

**Why this priority**: Equal first. The default is ISO-8859-15 and umlauts are common, so getting this wrong corrupts most club names on most imports — and because ISO-8859-15 never fails to decode, it corrupts them *silently*. A roster of mojibake is worse than no roster: it looks imported.

**Independent Test**: Export the same Meisterschaft twice, once as ISO-8859-15 and once as UTF-8, import both, and verify `Tischtennisverein Höxter` and `TTV Grün-Weiß Daseburg` are recorded identically from each.

**Acceptance Scenarios**:

1. **Given** an ISO-8859-15 export, **When** it is imported, **Then** umlauts and ß are recorded correctly.
2. **Given** a UTF-8 export, **When** it is imported, **Then** umlauts and ß are recorded correctly.
3. **Given** the same Meisterschaft exported in both character sets, **When** both are imported, **Then** they produce identical team records.
4. **Given** a file whose character set cannot be established, **When** it is imported, **Then** the import is refused rather than recording names that may be corrupt.

---

### User Story 3 - Collect a season's inputs with one command (Priority: P2)

An admin runs the existing CLI and gets the roster export alongside the wish PDFs it already downloads, bundled together, ready to upload in one go.

**Why this priority**: The manual export is a small chore, but it is a chore each time the roster changes — a team registering or withdrawing, not once a season. The CLI already signs in and downloads wish PDFs, so this is one more navigation on a working session rather than new machinery. It ranks below the import itself because a hand-exported file imports identically; this is about how the file arrives.

**Independent Test**: Run the CLI for a Bezirk and season, and verify it produces a bundle containing the Tabellen CSV and the wish PDFs, without any manual download.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** the admin runs the collection command for a Bezirk and season, **Then** it signs in, requests the Tabellen export for that Meisterschaft, waits for the link, and saves the CSV alongside the wish PDFs.
2. **Given** the export takes time to generate, **When** the command runs, **Then** it waits for the download link rather than failing immediately.
3. **Given** the export never appears, **When** the wait elapses, **Then** the command reports what it was waiting for and saves nothing partial.
4. **Given** downloads complete, **When** the command finishes, **Then** it emits a single bundle of the CSV and the wish PDFs.
5. **Given** the command runs, **When** it authenticates, **Then** it uses credentials from the environment, and no credential reaches the webapp.

---

### User Story 4 - Upload a season's inputs as one bundle (Priority: P2)

An admin uploads one bundle rather than a CSV plus a PDF per club, and is told plainly if it is missing anything.

**Why this priority**: The counterpart to User Story 3 — a bundle nothing accepts is not worth producing. It ships with it.

**Independent Test**: Upload a bundle of the CSV plus wish PDFs and verify both are imported. Upload one with no CSV and verify the omission is reported rather than silently importing only the PDFs.

**Acceptance Scenarios**:

1. **Given** a bundle of a Tabellen CSV and wish PDFs, **When** an admin uploads it, **Then** each file is imported as its own source type.
2. **Given** a bundle with no CSV, **When** it is uploaded, **Then** the system reports the roster is missing rather than importing only the wish PDFs.
3. **Given** a bundle with no wish PDFs, **When** it is uploaded, **Then** the system reports them missing rather than importing only the roster.
4. **Given** a bundle containing files of neither kind, **When** it is uploaded, **Then** they are reported as unrecognised rather than ignored silently.
5. **Given** a bare CSV rather than a bundle, **When** it is uploaded, **Then** it imports exactly as before. The bundle is an additional way in, not the only one.

---

### User Story 5 - Match parsed sources against the known roster (Priority: P2)

Where click-TT group assignments or wish PDFs name a club, the system resolves that name to a canonical club rather than inventing an identity from the spelling.

**Why this priority**: It is why the roster is worth importing — but the roster has standalone value first (User Story 1 answers "which teams should exist?"), and this depends on it.

**Independent Test**: With the roster imported, parse a source naming `SC GW Paderborn` and verify it resolves to club 42706 rather than creating a new club identity.

**Acceptance Scenarios**:

1. **Given** an imported roster, **When** a parsed source names a club that matches a roster entry exactly, **Then** it resolves to that canonical club.
2. **Given** an imported roster, **When** a parsed source names a club that matches no entry exactly, **Then** it is offered for review against roster candidates rather than silently creating a new identity.
3. **Given** no roster imported for the scope, **When** sources are parsed, **Then** the existing behaviour is unchanged and nothing breaks.

---

### User Story 6 - Know which teams are missing or unexpected (Priority: P3)

An admin can see which teams the roster expects but no parsed source mentions, and which parsed teams the roster does not contain.

**Why this priority**: The roster's other value — it is the only source that says how many teams *should* exist. Useful, but nothing is blocked without it.

**Independent Test**: Import the roster, parse sources covering only part of the Bezirk, and verify the uncovered teams are listed as expected-but-absent.

**Acceptance Scenarios**:

1. **Given** an imported roster and parsed sources, **When** the admin views the comparison, **Then** teams in the roster with no parsed counterpart are listed.
2. **Given** an imported roster, **When** a parsed source names a team absent from the roster, **Then** it is listed as unexpected rather than accepted silently.

---

### Edge Cases

- The export is uploaded for a Bezirk that has no input set yet.
- Two exports for the same Bezirk and season are uploaded, the second taken later with different contents (a team withdrew, a new team registered).
- A club's name changes between exports while its `VereinNr` stays the same — identity must follow the number, not the name.
- A team's `MannschaftNr` changes between exports (a club's second team becomes its first).
- The export contains a Meisterschaft spanning more than one Region.
- The file is empty, truncated, or contains only a header.
- The file is a Tabellen export of a different kind (a different Download option) with different columns.
- The download link never appears in nuLiga admin, so no file is obtained.
- An export is imported for a season already planned, changing the roster underneath existing input sets.

## Requirements *(mandatory)*

### Functional Requirements

#### Import

- **FR-001**: The system MUST accept a nuLiga "Tabellen (aktuelle Tabellen - Filter Meisterschaft)" export as a source for a scope and season.
- **FR-002**: The system MUST record each team's canonical identity: `VereinNr`, `Altersklasse`, and `MannschaftNr`.
- **FR-003**: The system MUST record each team's club name, `Liga` and `Gruppe` alongside its identity.
- **FR-004**: Re-importing an export MUST NOT duplicate teams. `VereinNr` + `Altersklasse` + `MannschaftNr` identifies a team within a season.
- **FR-005**: The system MUST verify the export's `Region` and `Saison` match the scope and season it is imported for, and MUST report a mismatch rather than importing.
- **FR-006**: The system MUST reject a file that is not this export, with a message naming what was expected, and record nothing.
- **FR-007**: The system MUST ignore the standings columns (`Rang`, `Begegnungen`, `Siege`, and the rest). This feature imports a roster; the export merely happens to carry results.

#### Character set

- **FR-010**: The system MUST read exports in both ISO-8859-15 (the nuLiga default) and UTF-8, producing identical team records from either.
- **FR-011**: The system MUST NOT assume ISO-8859-15. That encoding cannot fail to decode, so assuming it turns a UTF-8 export into silent mojibake rather than an error.
- **FR-012**: Where the character set cannot be established with confidence, the system MUST refuse the import rather than record names that may be corrupt. A roster of mojibake is worse than no roster: it looks imported.
- **FR-013**: Club names containing umlauts or ß MUST be recorded exactly as they appear in nuLiga.

#### Collection (CLI)

- **FR-014**: The CLI MUST be able to download the Tabellen export for a Meisterschaft, reusing the authenticated Playwright session it already uses to download wish PDFs (`scrapeSeasonModel`, `src/raster/ingest/scrape.ts:91`).
- **FR-015**: The CLI MUST wait for the export's download link rather than assuming an immediate download. Where it never appears, the CLI MUST report what it was waiting for and save nothing partial.
- **FR-016**: The CLI MUST request the export in a character set it can read reliably, rather than accepting whatever the form defaults to (see FR-010 to FR-013).
- **FR-017**: The CLI MUST emit the CSV and the wish PDFs for a scope and season as one bundle.
- **FR-018**: Credentials MUST come from the environment and remain in the CLI. The webapp MUST NOT hold click-TT credentials or drive an authenticated click-TT session — it stays read-only toward click-TT, per constitution Principle II.

#### Bundle upload

- **FR-019a**: The webapp MUST accept a bundle containing a Tabellen CSV and wish PDFs as a single upload, importing each file as its own source type.
- **FR-019b**: Where a bundle lacks a CSV, or lacks wish PDFs, the system MUST say what is missing rather than importing what is present and staying quiet. A half-loaded scope that reports success is the failure this avoids.
- **FR-019c**: Files in a bundle matching no known source type MUST be reported as unrecognised, not ignored.
- **FR-019d**: A bare CSV MUST import exactly as it does without a bundle. The bundle is an additional way in, not a replacement.

#### Identity

- **FR-020**: Canonical identity MUST follow `VereinNr`, not the club name. A club renamed between exports keeps its identity.
- **FR-021**: A roster team's `Altersklasse` MUST be taken from the export's own column rather than inferred from a team label. This governs roster rows only. Whether the roster should also *replace* `splitTeamName`'s label parsing elsewhere is Q2, deliberately deferred — the label path survives for unrostered scopes regardless.
- **FR-022**: The roster MUST be available to other features as the authoritative answer to "which teams exist in this scope and season, and in which group".

#### Matching

- **FR-030**: Where a parsed source names a club matching a roster entry exactly, the system MUST resolve it to that canonical club.
- **FR-031**: Where a parsed source names a club matching no roster entry exactly, the system MUST offer it for review against roster candidates, and MUST NOT silently create a new identity.
- **FR-032**: Where no roster is imported for a scope, existing behaviour MUST be unchanged. This feature adds an authority; it does not require one.

#### Coverage

- **FR-040**: The system MUST be able to list teams the roster expects that no parsed source mentions.
- **FR-041**: The system MUST be able to list parsed teams the roster does not contain.

### Key Entities

- **Team Roster**: The set of teams click-TT says exist for a scope and season, imported from one export. The authority for "which teams should be there".
- **Canonical Team**: `VereinNr` + `Altersklasse` + `MannschaftNr`, with club name, Liga and Gruppe. Unique within a season — verified across all 404 rows of the OWL 2026/27 sample.
- **Canonical Club**: `VereinNr` and its name. Identity is the number; the name is a label that may change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Importing the OWL 2026/27 export records 404 teams, 85 clubs and 43 groups.
- **SC-002**: The same Meisterschaft exported as ISO-8859-15 and as UTF-8 produces identical team records.
- **SC-003**: No club name is recorded with mojibake, from any export in either character set.
- **SC-004**: Re-importing an unchanged export changes nothing and duplicates nothing.
- **SC-005**: A club renamed between two exports keeps one identity across both.
- **SC-006**: With a roster imported, a parsed source naming a club by an exact roster name resolves without a review step.
- **SC-007**: An admin can answer "which teams are missing from my sources?" for a scope without leaving the app.
- **SC-008**: Scopes with no imported roster behave exactly as before this feature.
- **SC-009**: An admin can collect a scope's roster and wish PDFs, and upload them, without downloading any file by hand.
- **SC-010**: An incomplete bundle is never imported silently — what is missing is always stated.
- **SC-011**: No click-TT credential is held by, or reaches, the webapp.

## Assumptions

- The export is downloaded by the CLI, alongside the wish PDFs it already collects. This is not a new credential surface: `scrapeSeasonModel` already launches Playwright with `acceptDownloads: true` and signs in with credentials from `.env`. The webapp never authenticates against click-TT.
- nuLiga admin is reachable with the credentials the CLI already uses. If the admin area needs a different account from the one the match-approval flow uses, FR-014 needs revisiting — it assumes one login reaches both.
- A hand-exported CSV imports identically to a CLI-collected one. The collection path is convenience; the import path is the feature.
- One export covers one Meisterschaft: a Bezirk and a season, matching how input sets are scoped.
- The export's standings columns are ignored. They are zero before a season starts and irrelevant to planning regardless.
- `VereinNr` is stable across exports within a season. This is what makes it identity. It is not assumed stable across seasons, which nothing here requires.
- The roster is authoritative for which teams exist. Where sources disagree with it, the roster is right and the source needs review.
- This feature does not change how wishes are parsed, matched to teams, or reviewed. It supplies the identity those processes match *against*.

## Out of Scope

- Any change to wish parsing, wish conflict review (feature 008), or the guided flow (feature 005).
- Downloading wish PDFs. The CLI already does this; this feature adds the CSV beside them and bundles the result.
- Replacing the click-TT group assignment scraper. The roster complements it; the scraper still supplies Rasterzahlen, which this export does not carry.
- Retiring Phase 12's fuzzy matching (T079-T082). This feature is expected to shrink that work by making the match target canonical, but wish PDFs still carry names rather than numbers, so matching names to the roster remains necessary.
- Importing rosters for scopes outside the WTTV hierarchy already modelled.

## Open Questions

- **Q1 (resolved 2026-07-15)**: The CLI downloads the export via Playwright, alongside the wish PDFs it already collects, and emits one bundle; the webapp accepts that bundle and reports anything missing. This is not a new credential surface — `scrapeSeasonModel` already signs in with `.env` credentials and downloads with `acceptDownloads: true` — so the constitution's read-only guarantee for the webapp is untouched. See FR-014 to FR-019d.
- **Q2 (scope)**: Should the roster replace `splitTeamName`'s label parsing? `Altersklasse` is canonical and exact, and the derived label (`Jugend 19`, `Damen`, `Erwachsene`) currently drives the match-duration heuristic that PR #10 had to align across three implementations. Reading the roster instead would remove that heuristic entirely — but only for teams the roster covers, so the label path cannot be deleted while unrostered scopes exist.
- **Q3**: What happens to an existing input set when a later export changes the roster underneath it — a team withdrew, or a new team registered? Feature 008 answers the equivalent question for wishes (propose, never overwrite). The same answer probably applies, but the roster is authoritative in a way wishes are not, which may argue for different handling.
