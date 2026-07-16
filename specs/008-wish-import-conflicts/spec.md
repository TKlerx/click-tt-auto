# Feature Specification: Wish Import Conflict Review

**Feature Branch**: `[008-wish-import-conflicts]`  
**Created**: 2026-07-15  
**Status**: Draft  
**Input**: User description: "When importing new wish PDFs, do not overwrite existing wishes. Whenever existing system data and new PDFs conflict, trigger a user review. New teams may be added, and reviewed teams missing from the latest import should be kept but marked."

## Clarifications

### Session 2026-07-15

- Q: Today wishes are rebuilt from all registered sources on every sync — do they stop being derived state? → A: Yes. Wishes become **owned**: a source's first parse seeds them, and after that nothing automated ever rewrites an active wish. Every difference is proposed for review, whether or not anyone previously edited the row. This matches the existing Assumption that "existing wish" means the active wish "regardless of whether it was previously reviewed", and it removes the need for an "was this edited?" flag.
- Q: A conflict was resolved as "keep existing" against an imported value. Does re-importing that same value raise it again? → A: No. A decision is remembered **per imported value**: "my 19:30 beats this PDF's 19:00" holds for as long as the PDF keeps saying 19:00. If the imported value later changes to something not yet ruled on, that is a new conflict. Each disagreement is decided once, not once per import.
- Q: What does "missing from latest import" mean when several wish PDFs are registered? → A: "Latest import" is the **current union of all registered wish sources**, not the batch just uploaded. A wish is missing only when no source produces it any more — a team dropped out of its PDF, or the source was deleted. Re-uploading one club's PDF never marks other clubs' wishes as missing. Deleting a source marks its wishes missing rather than removing them.
- Q: Should unresolved conflicts block optimizer runs (original FR-009, SC-004)? → A: No. Under owned wishes the active wish is always well-defined, so a run with unresolved conflicts uses exactly the values "keep existing" would have chosen — the inputs are valid, not broken. The run proceeds and its coverage record notes the unresolved conflicts, reusing feature 006's mechanism rather than adding a third gate with a different philosophy from 005's group exclusion and 006's "never refuse, always record".
- Q: How do 008's conflict review and feature 005's per-record matching review relate, given both react to a re-parsed PDF? → A: They compose, and never fire for the same event. Under owned wishes a re-parse changes no active wish, so 005's matching review does not fire on import; it fires only once a conflict is resolved in a way that actually changes the wish. 008 asks "should this wish change?"; 005 asks "given it changed, is it still matched to the right team?". Feature 005's FR-010 needs rewording: a source refresh alone no longer makes a record outstanding — resolving a conflict does.
- Q: What identifies an imported row as "the same wish" as an existing one? → A: The **canonical team**, not the parsed club name. click-TT knows which teams exist and which group each belongs to; a team is identified by `VereinNr` + `Altersklasse` + `MannschaftNr`. An imported row conflicts with the existing wish *for that team*. Wish PDFs carry names rather than numbers, so matching a PDF row to a canonical team still needs fuzzy logic — but the target is a fixed, known set rather than a second name-list to reconcile. This depends on canonical identity being available; see the dependency note below.

## Context: what happens today

Wishes are **derived** state. `replaceParsedWishes` (`webapp/src/services/raster/wishes.ts:22`) runs `deleteMany({ inputSetId })` and re-inserts from parsed PDFs. The normal path (`syncInputSetFromSources`) re-derives every wish from the union of all registered wish sources on each sync; a second path (`POST /api/raster/input-sets/[id]/wishes/pdf`) does the same from a single uploaded file.

**And a third**: `replaceJsonWishes` (`wishes.ts:79`) does the identical `deleteMany({ inputSetId })` behind `POST /api/raster/input-sets/[id]/wishes/json` — the structured-JSON fallback `003` established for when a PDF will not parse. Same destruction, different door.

*(Line numbers verified against `main` after feature 005 landed. 005 rekeyed the schema but left this logic untouched, so the premise below is current, not historical.)*

Two consequences shape this feature:

- **The data loss is live, not hypothetical.** `updateWish` (`wishes.ts:116`) writes admin corrections straight to `RasterWish`. The next sync deletes them. FR-002 exists because of this.
- **This feature inverts the model.** Wishes stop being rebuilt and become owned records that imports propose changes to. `replaceParsedWishes` is retired rather than adjusted — sparing "the right rows" from a `deleteMany` is the failure mode this feature is meant to end, not a way to implement it.

## Context: team identity, and why it is a dependency

Conflict detection needs to know that an imported row *is* an existing wish. That is a question about team identity, and the answer does not currently exist in the system.

The click-TT scraper (`src/raster/ingest/clicktt-assignments.ts`) captures a team's **name** from a table cell, along with its league, group and Rasterzahl. It captures no club number. That is why `splitTeamName` must parse a display string, and why the parsed-identity backlog (`specs/003-raster-review-webapp/tasks.md` Phase 12, T079-T082) exists at all: given only names, `SC GW Paderborn` and `SC Grün-Weiß Paderborn` need fuzzy matching and persisted aliases to be recognised as one club.

A nuLiga admin export — "Tabellen (aktuelle Tabelle - Filter Meisterschaft)" — carries what the scraper drops. A sample for OWL 2026/27 (`data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv`) holds 404 teams across 85 clubs and 43 groups, with `VereinNr` per club (`SC GW Paderborn` = 42706) and `Altersklasse` per team (`Erwachsene`, `Damen`, `Jugend 19`, `Jugend 15`, `Jugend 13`). `VereinNr` + `Altersklasse` + `MannschaftNr` is unique across all 404 rows.

So canonical identity is available from click-TT — the current import path simply does not take it. **The alias problem is an artifact of the import path, not of the domain.**

**Dependency**: this feature anchors conflicts on canonical team identity, which requires importing that export. That importer is out of scope here and is expected to be specified separately (feature 009). Until it exists, an imported row that cannot be paired to a canonical team appears as an unmatched import row for manual matching (see Edge Cases) rather than becoming a second active wish.

The export is obtained today by hand: sign in to nuLiga admin, open Downloads, select "Tabellen (aktuelle Tabelle - Filter Meisterschaft)", click Exportieren, and wait for the download link. Automating that needs an authenticated admin session, which the constitution scopes to the CLI capabilities rather than the webapp — another reason it belongs in its own feature rather than here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review Conflicting Wish Imports (Priority: P1)

As a district admin, I want a new wish PDF import to show every contradiction against existing wishes before changing anything, so reviewed or previously stored data is never silently overwritten.

**Why this priority**: This prevents data loss and keeps imports trustworthy.

**Independent Test**: Start with an input set containing an existing wish, import a PDF with a different day, time, hall, week preference, or requested schedule number for the same team, and verify the conflict appears for explicit review while the existing wish remains unchanged.

**Acceptance Scenarios**:

1. **Given** an existing wish for a team, **When** a new PDF import contains a different wish for the same team, **Then** the system keeps the existing wish and creates a review item showing both values.
2. **Given** a conflict review item, **When** the admin chooses "keep existing", **Then** the existing wish remains active and the review item records the decision.
3. **Given** a conflict review item, **When** the admin chooses "use imported", **Then** the imported wish becomes active and the review item records the decision.
4. **Given** a conflict review item, **When** the admin edits the wish manually, **Then** the edited value becomes active and the review item records that a manual value was chosen.

---

### User Story 2 - Import Non-Conflicting New Wishes (Priority: P2)

As a district admin, I want new teams from fresh PDFs to be added without extra ceremony, so imports remain efficient when they do not threaten existing data.

**Why this priority**: New data should not be blocked by the conflict workflow.

**Independent Test**: Import a PDF containing a team that has no existing wish row and verify it is added as an imported, unreviewed wish.

**Acceptance Scenarios**:

1. **Given** a PDF contains a team with no existing wish, **When** the import is processed, **Then** the new wish is added and marked as imported/unreviewed.
2. **Given** a PDF row exactly matches an existing wish, **When** the import is processed, **Then** no duplicate wish and no conflict are created.

---

### User Story 3 - See Wishes Missing From Latest Import (Priority: P3)

As a district admin, I want wishes already in the system but missing from the latest PDFs to stay visible, so I can notice stale or incomplete imports without losing previous work.

**Why this priority**: Missing rows are useful warnings, but they should not block normal conflict review.

**Independent Test**: Start with an existing wish, import PDFs that do not contain that team, and verify the existing wish remains active with a "missing from latest import" status.

**Acceptance Scenarios**:

1. **Given** an existing wish is absent from the latest import, **When** import review is shown, **Then** the wish remains active and is marked as missing from latest import.
2. **Given** a missing-from-import wish, **When** the admin confirms it is still valid, **Then** the missing marker is cleared or recorded as accepted for that import.

### Edge Cases

- Same PDF uploaded more than once: the import review should not create duplicate active wishes or duplicate conflict rows for identical parsed content.
- Same team appears in multiple uploaded PDFs with different wishes: the import review must show the imported contradiction before comparing it to active system data.
- A parsed row cannot be matched confidently to a team: it must appear as an unmatched import row for manual matching, not overwrite a guessed team.
- Wishes arrive through the structured-JSON fallback rather than a PDF: the same conflict rules apply. A fallback is used when something has already gone wrong, which is the worst moment to lose corrections.
- A PDF parse produces no teams: the import must fail with a clear message and leave existing wishes unchanged.
- An admin leaves conflicts unresolved: validation and optimizer runs must not use unresolved imported changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat every wish PDF import as a proposed change set before applying changes to active wishes.
- **FR-001a**: Active wishes MUST be owned rather than derived. No automated process — import, source refresh, or sync — may rewrite an active wish. A source's first parse seeds wishes; every later parse proposes.
- **FR-001c**: The season model's wish fields — `homeWeekday`, `hall`, `startTime`, `spielwochePref`, `requestedRasterzahl` — MUST derive from **active wishes**, not from parsed sources. Today `applyParsedWishDetails` (`webapp/src/services/raster/inputSets.ts:340-360`) writes them onto `model.teams` straight from the parse, keyed by club and label, and never reads `RasterWish`. Since validation and the optimizer consume the season model, this means a corrected wish **does not reach planning even before the next sync deletes it**. Without this requirement the rest of the feature is cosmetic: imports would stop overwriting a table that nothing plans from, and conflicts would be reviewed over data the optimizer ignores.
- **FR-001b**: **Every** delete-and-recreate path over wishes MUST be retired rather than adapted. Sparing selected rows from a bulk delete is the failure this feature exists to end, not a way to implement it. There are **two** such paths, and both destroy corrections identically:
  - **FR-001b-i**: `replaceParsedWishes` (`webapp/src/services/raster/wishes.ts:22`) — `deleteMany({ inputSetId })` then re-insert from parsed sources. The normal path, reached by every source sync.
  - **FR-001b-ii**: `replaceJsonWishes` (`wishes.ts:79`) — the same `deleteMany({ inputSetId })` then re-insert, behind `POST /api/raster/input-sets/[id]/wishes/json`. This is the LLM-pasted / structured-JSON fallback that `003` established as the escape hatch when a PDF cannot be parsed. Retiring only the first would leave the fallback quietly eating corrections — and a fallback is used precisely when things have already gone wrong, which is the worst moment to lose work.
- **FR-002**: The system MUST NOT overwrite an existing wish when the imported wish differs in day, time, hall, week preference, requested schedule number, team identity, or notes.
- **FR-002a**: This MUST hold regardless of whether the existing wish was ever manually edited or reviewed. An untouched wish is protected exactly as a corrected one is.
- **FR-003**: The system MUST create a conflict review item for every differing existing/imported wish pair.
- **FR-003a**: An imported row MUST be paired with an existing wish by canonical team identity (`VereinNr` + `Altersklasse` + `MannschaftNr`), not by parsed club name. A row that cannot be paired MUST become an unmatched import row for manual matching, and MUST NOT become a second active wish for a team that already has one.
- **FR-004**: Users MUST be able to resolve each conflict by keeping the existing wish, using the imported wish, or entering a manual value.
- **FR-004a**: A resolution MUST be remembered against the imported value it ruled on. Re-importing that same value MUST NOT raise the conflict again. An imported value not yet ruled on MUST raise a new conflict, even for a wish whose earlier conflicts are resolved.
- **FR-005**: The system MUST add imported wishes for teams with no existing wish, marked as imported/unreviewed.
- **FR-006**: The system MUST avoid duplicate active wishes when identical imports are uploaded multiple times.
- **FR-007**: The system MUST keep active wishes that are missing from the latest import and mark them as missing from latest import.
- **FR-007a**: "Latest import" means the current union of all registered wish sources, not the batch most recently uploaded. Re-uploading one club's PDF MUST NOT mark another club's wishes as missing.
- **FR-007b**: Deleting a wish source MUST mark the wishes only it produced as missing from latest import, rather than removing them.
- **FR-008**: The system MUST show unresolved conflicts prominently before validation or optimizer runs.
- **FR-009**: Unresolved import conflicts MUST NOT block validation or optimizer runs. The active wish is well-defined at all times, so a run with unresolved conflicts uses exactly the values "keep existing" would have chosen — its inputs are valid, not broken.
- **FR-009a**: A run started with unresolved conflicts MUST record that fact on the run, consistent with feature 006's coverage record (its FR-030 to FR-038), so the result states what was outstanding when it ran.
- **FR-010**: The system MUST preserve an audit trail of import decisions, including source, previous value, imported value, chosen value, actor, and time.
- **FR-011**: The conflict review UI MUST support filtering to unresolved conflicts, added wishes, missing-from-import wishes, and accepted/no-op matches.
- **FR-012**: The system MUST leave existing active wishes unchanged if an import fails parsing or matching.

### Key Entities *(include if feature involves data)*

- **Wish Import Batch**: A single user-initiated import operation containing one or more wish PDFs and its parsed rows.
- **Imported Wish Row**: A parsed wish candidate from an import batch, including source file, team match status, and parsed fields.
- **Active Wish**: The currently used wish row for planning, validation, and optimizer input.
- **Wish Import Conflict**: A review item linking an active wish and one or more imported rows with differing values.
- **Conflict Decision**: The user's resolution for a conflict: keep existing, use imported, or manual value. Recorded against the imported value it ruled on, so the same value never asks twice (FR-004a).
- **Canonical Team**: A team as click-TT knows it — `VereinNr` + `Altersklasse` + `MannschaftNr`. The anchor that pairs an imported row with an existing wish. Not currently available in the system; see the dependency note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In tests with conflicting imports, 100% of existing active wishes remain unchanged until a user resolves the conflict.
- **SC-002**: Users can identify all unresolved import conflicts for an input set in under 30 seconds.
- **SC-003**: Re-uploading the same PDFs creates zero duplicate active wish rows.
- **SC-004**: A run started with unresolved conflicts completes, and its result states how many were outstanding when it ran.
- **SC-005**: For a 50-team import with 10 conflicts, an admin can resolve all conflicts without leaving the import review screen.
- **SC-006**: An admin who has corrected a wish never loses that correction to any later import or sync.
- **SC-009**: A corrected wish reaches the optimizer. Correct a wish, start a run, and the run plans against the corrected value — not the parsed one. Today it does not, because the season model is built from the parse (FR-001c).
- **SC-007**: Re-importing an unchanged PDF raises conflicts only for wishes the admin has manually changed, and raises each of those at most once.
- **SC-008**: Re-uploading one club's wish PDF marks no other club's wishes as missing from latest import.

## Assumptions

- Existing source upload and PDF parsing remain the normal way to bring wish PDFs into the app.
- "Existing wish" means the wish that *should be* used by validation and optimization, regardless of whether it was previously reviewed. This is what makes wishes owned rather than derived (FR-001a), and why an untouched wish is protected exactly as a corrected one is.
  - **Correction (2026-07-15, from planning)**: this originally read "the active wish **currently** used by validation and optimization", which was false about the code. `RasterWish` is *not* currently used by either — `applyParsedWishDetails` builds the season model's wish fields straight from the parsed sources and never reads `RasterWish`, so a correction never reaches planning at all. Making `RasterWish` authoritative is therefore part of this feature, not an existing property it can rely on. FR-001c states it.
- Exact-match imports should be treated as no-op matches, not conflicts.
- Missing-from-latest-import warnings are informational unless combined with another validation problem.
- Canonical team identity is expected from a nuLiga admin export, imported by a separate feature (009). This feature is buildable before that lands, but until it does, conflict pairing rests on parsed names and unmatched rows will be more common. It never silently duplicates: unpaired rows surface for manual matching (FR-003a).
- Feature 006's coverage record is the mechanism for recording unresolved conflicts on a run (FR-009a). If 006 has not landed, that recording needs its own home rather than a new gate.
- Nothing in this feature blocks a run. Consistent with feature 005 (excluding groups to proceed) and feature 006 (never refuse, always record), the system reports what is outstanding rather than refusing to act.
