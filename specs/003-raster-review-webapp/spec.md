# Feature Specification: Raster Generation & Review Webapp

**Feature Branch**: `003-raster-review-webapp`  
**Created**: 2026-07-08  
**Status**: Draft  
**Input**: User description: "Create a webapp based on ../webapp-template where users upload the raw district inputs (club scheduling wishes, hall capacities, and fixed upper-league Rasterzahlen), let the app generate a Rasterzahl assignment via an optimizer run, and then review hall-capacity conflicts, assignments, and capacity edits. Importing a pre-computed external optimizer snapshot is an optional later path."

## Context

This webapp owns the **full Rasterzahl pipeline** for a district, not just the review of finished optimizer output:

1. **Ingest** raw inputs — club scheduling wishes, hall capacities, and the already-fixed Rasterzahlen of upper leagues.
2. **Generate** a Rasterzahl assignment by running an optimizer over those inputs (respecting the fixed upper-league Rasterzahlen and hall capacities as constraints).
3. **Review** the result — hall-capacity conflicts, per-team assignments, and the capacity data behind them — and correct capacity/input data before re-running.

Raw inputs arrive today mostly as PDFs; the app must accept structured versions too. Wishes PDFs share a fixed layout, so the app parses them **deterministically in-app** (reusing the existing `pdfjs-dist`-based parser) and presents the result for review — it runs **no** LLM itself. Only as a fallback (low-confidence parse or drifted layout) does it hand the user a ready-made prompt + JSON schema to run in their own LLM and paste back. Importing a pre-computed snapshot from the legacy external optimizer is a **later, optional** capability that reuses the same review layer.

## Clarifications

### Session 2026-07-09

- Q: Is the webapp a review-only tool for external optimizer output, or does it generate the Rasterzahl itself? → A: It generates. Users upload raw inputs and the app runs the optimizer to produce assignments/conflicts. Importing a pre-computed external snapshot is an optional later path (not the primary flow).
- Q: In what form do club wishes arrive, and how are PDFs parsed? → A: PDF today (structured JSON/CSV may come later); support both. The wishes PDFs always share the same fixed layout, so the primary path is the existing deterministic in-app parser (`src/raster/ingest/wishes-pdf.ts` using `pdfjs-dist` text extraction + known-layout patterns), which emits clubs/teams marked for review. The app runs NO LLM. An optional fallback, for when the parser is low-confidence or the layout drifts, is a ready-made prompt (embedding the PDF text + expected JSON schema) the user runs in their own LLM and pastes the JSON back for schema validation. The user reviews/corrects wishes before a run.
- Q: How are concurrent capacity edits handled? → A: No locking. Few users edit capacity, roughly once a year, so last-write-wins is acceptable; the audit trail records who changed what and when.
- Q: Are wishes PDFs text-based or scanned? → A: Assume digital/text-based PDFs for the first release (text extraction only). OCR for scanned PDFs is out of scope unless it turns out to be needed.
- Q: In what form does hall capacity arrive? → A: CSV/Excel upload or manual form entry. A capacity value may start as an inferred/guessed default and be corrected later. The capacity list must be searchable.
- Q: In what form do the fixed upper-league Rasterzahlen arrive? → A: PDF or manual entry (volume is small), structured import also acceptable. They are treated as hard constraints the optimizer must not violate.
- Q: How does the app run the optimization? → A: Wrap the existing Rasterzahl optimizer as an asynchronous background job. The app prepares the reviewed input set, invokes the existing optimizer, and ingests its output into the snapshot model. It does not reimplement the solver.
- Q: What data scale must the app handle? → A: ~100–1,000 assignments and up to a few hundred conflicts per district snapshot. The system may later hold county-wide data (~1,400 clubs/teams), but review views remain scoped to a selected district, so a single view stays at the hundreds scale.
- Q: How should shared documents and links be scoped if OWL is only one WTTV district? → A: Model a hierarchy of scopes: Germany → WTTV → configured WTTV districts. Input sets still target a district such as OWL, but source documents/links and parsed caches belong to the scope where they are valid. A district input set may use district sources plus ancestor sources from WTTV and Germany.

### Session 2026-07-11

- Q: Is a group assignment the same as fixed Rasterzahlen? → A: No. Group assignment means which teams play in which league/group. Fixed Rasterzahlen are optional preassigned schedule numbers inside a group and are hard constraints if provided. In English UI copy, use "schedule number" or "fixed schedule number" for Rasterzahl where a non-German term is needed.
- Q: Should group assignments be uploaded as PDFs? → A: Not in the primary flow. The primary group-assignment source is a click-TT league page URL for the selected season/scope. Group-assignment file upload may remain as a hidden/advanced fallback, but the visible flow must not suggest it as the normal path.
- Q: How should wish PDFs be handled? → A: Wish PDFs are independent of group assignment and must support multi-file upload. Each uploaded PDF is stored as a separate source and later parsed/refreshed explicitly.
- Q: Can the app run without any fixed Rasterzahlen? → A: Yes. Fixed schedule numbers are optional. A full WTTV or district run may proceed with zero fixed numbers; the optimizer assigns schedule numbers subject to the available group, wish, and capacity inputs.
- Q: How should districts and seasons be selected? → A: District/scope selection must come from configured scope data, not free text, and should show or sort by hierarchy. The seeded WTTV hierarchy includes WTTV plus all listed WTTV districts. Season is part of the input-set/source identity and must be selectable in the UI.
- Q: How are wrong uploads handled? → A: Admins must be able to delete wrongly registered sources. PDF uploads must at least be checked as real PDF files before storage, and explicit parser refresh must report when a document cannot be parsed as the expected source type.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a Rasterzahl Proposal From Inputs (Priority: P1)

An admin/scheduler provides the district inputs (club wishes, hall capacities, fixed upper-league Rasterzahlen), starts a generation run, and receives a Rasterzahl assignment plus its hall-capacity conflicts.

**Why this priority**: This is the core purpose of the app. Without in-app generation there is nothing to review.

**Independent Test**: Provide a small but complete input set, start a run, and verify the app produces an assignment and a conflict list consistent with the inputs and the fixed upper-league Rasterzahlen.

**Acceptance Scenarios**:

1. **Given** uploaded wishes, hall capacities, and fixed upper-league Rasterzahlen, **When** an admin starts a generation run, **Then** the app records the run as pending and processes it asynchronously without blocking other review.
2. **Given** a digital, fixed-layout PDF of wishes, **When** the user uploads it, **Then** the app parses it deterministically in-app and presents the extracted clubs/teams marked for review, with no LLM involved.
3. **Given** the deterministic parser is low-confidence or the layout has drifted, **When** the user opens the fallback helper, **Then** the app shows a ready-made prompt embedding the PDF text + expected JSON schema to run in an external LLM, and accepts and schema-validates the pasted JSON.
4. **Given** structured wishes are available, **When** the user uploads them directly, **Then** the app uses them without any PDF-parsing or prompt step.
5. **Given** a completed run with a proven optimum, **When** a scheduler opens the generated snapshot, **Then** it clearly states the assignment is optimal for the configured objective and constraints and never violates a fixed upper-league Rasterzahl.
6. **Given** a run reaches its configured limit before proof, **When** a scheduler opens the snapshot, **Then** it clearly states the assignment is feasible but not proven optimal.
7. **Given** no valid assignment exists under the hard constraints, **When** the run finishes, **Then** the app reports that no feasible solution was found and shows the relevant blocking constraints where available.
8. **Given** two same-club teams share one group, **When** a generated assignment uses the Spieltag-4 derby fallback, **Then** the snapshot shows that fallback in the objective breakdown; Spieltag 5 or later is treated as infeasible/invalid and is never persisted as a valid generated assignment.
9. **Given** the parsed input set contains any six-team group, **When** an admin reviews the input set before starting a run, **Then** the app shows those groups on a confirmation step and lets the admin choose normal 6er or 6er Doppelrunde for each group; the run cannot start until every six-team group has an explicit mode.
10. **Given** a WTTV-level group document or link exists, **When** an admin prepares an OWL input set, **Then** the app offers that WTTV source as an inherited source without copying or reclassifying it as OWL-only.
11. **Given** an admin prepares group assignments, **When** they enter a click-TT league page URL for a season/scope, **Then** the app registers it as a group-assignment source without requiring a PDF upload or free-text source type.
12. **Given** an admin uploads club wishes, **When** they select multiple wish PDFs, **Then** each PDF is stored as its own wish source and can be refreshed/parsed independently.
13. **Given** an admin accidentally uploads or registers the wrong source, **When** they delete it, **Then** the source is removed from the preparation flow and any stored upload file is removed from app-controlled storage.
14. **Given** an input set has no fixed schedule numbers, **When** the admin validates and starts a run, **Then** validation does not fail solely because fixed schedule numbers are absent.
15. **Given** a source has been uploaded or registered but not parsed, **When** the admin views the preparation page, **Then** the app clearly shows that parsing/refresh is still needed before the source can contribute to a runnable input set.

---

### User Story 2 - Review Hall Conflicts (Priority: P1)

A district scheduler reviews a generated (or imported) snapshot and quickly understands which clubs, halls, weekdays, and match weeks exceed intended capacity.

**Why this priority**: The main risk in the Rasterzahl assignment is placing too many home matches into the same hall at the same time. The app must make those conflicts visible.

**Independent Test**: Open a snapshot with hall overages and verify that the overview, club grouping, and conflict list show the same overages as the underlying run output.

**Acceptance Scenarios**:

1. **Given** a snapshot with hall overages, **When** a scheduler opens the conflict overview, **Then** they see total overages, maximum excess, affected clubs, and a prioritized list of conflicts.
2. **Given** a club with repeated conflicts, **When** a scheduler filters by that club, **Then** they see only that club's conflict weeks, hall, weekday, capacity, actual team count, excess, and involved teams.
3. **Given** a snapshot with no overages, **When** a scheduler opens the conflict overview, **Then** the app shows that no hall-capacity conflicts were found and still allows assignment review.

---

### User Story 3 - Review Team Raster Assignments (Priority: P2)

A scheduler reviews the proposed Rasterzahl assignment for every team and can verify which assignments are optimized, fixed, pinned, or still need attention.

**Why this priority**: Conflict review shows where the proposal hurts; schedulers also need the concrete team-to-Rasterzahl output to judge whether the proposal can be used.

**Independent Test**: Open a snapshot and compare the assignment table against the run's assignment output.

**Acceptance Scenarios**:

1. **Given** a snapshot, **When** a scheduler opens the assignment view, **Then** they see league, group, club, team, Rasterzahl, assignment status, weekday, hall, start time, and week slot.
2. **Given** many assignments, **When** a scheduler searches or filters by club, league, group, or assignment status, **Then** the table updates without losing the selected snapshot context.
3. **Given** a team with a fixed or pinned Rasterzahl, **When** it appears in the assignment table, **Then** that status is visible and distinguishable from optimized assignments.

---

### User Story 4 - Manage Hall Capacity (Priority: P2)

A scheduler or admin provides and maintains hall capacity — by CSV/Excel upload, manual form entry, or by correcting an inferred/guessed default — and can search capacity records.

**Why this priority**: Many apparent conflicts are caused by missing or wrong capacity data. Good generation and review both depend on accurate, editable capacity.

**Independent Test**: Upload a capacity CSV, edit one entry via the form, guess-then-correct another, search for a club/hall/weekday, and verify the values feed the next run and the review views.

**Acceptance Scenarios**:

1. **Given** a capacity CSV/Excel file, **When** an authorized user uploads it, **Then** the app records reviewed capacity for each club/hall/weekday it contains.
2. **Given** a club/hall/weekday with no known capacity, **When** the user opens it, **Then** the app shows an inferred/guessed value that the user can accept or overwrite via a form.
3. **Given** many capacity records, **When** the user searches by club, hall, or weekday, **Then** the matching records are shown.
4. **Given** a reviewed capacity value changes after a snapshot import/generation, **When** the scheduler returns to the conflict overview, **Then** affected conflicts are marked stale until a newer snapshot is generated/imported.
5. **Given** a user without capacity-edit permission, **When** they view capacity detail, **Then** they can read capacity information but cannot change it.

---

### User Story 5 - Coordinate Review With Roles (Priority: P3)

Different users participate with appropriate permissions: admins manage users, inputs, and runs; schedulers review and edit capacity; viewers inspect results read-only.

**Why this priority**: Multiple people may help review, but not everyone should change inputs, edit capacity, or start runs.

**Independent Test**: Sign in as each role and verify allowed and blocked actions across input upload, run start, conflict review, capacity edit, and user administration.

**Acceptance Scenarios**:

1. **Given** an admin user, **When** they access the app, **Then** they can upload inputs, start runs, manage users, edit capacity, and review all data.
2. **Given** a scheduler user, **When** they access the app, **Then** they can review snapshots and edit capacity but cannot manage users.
3. **Given** a viewer user, **When** they access the app, **Then** they can view snapshots, assignments, and conflicts but cannot upload, start runs, edit, or approve.

---

### User Story 6 - Import a Pre-Computed External Snapshot (Priority: P4)

An admin imports a snapshot produced by the legacy external optimizer into the same review model, for comparison or when a run was done outside the app.

**Why this priority**: Optional convenience once in-app generation exists; it reuses the review layer with only an import adapter.

**Independent Test**: Import a pre-computed snapshot and verify it appears in the snapshot list and review screens identically to a generated one.

**Acceptance Scenarios**:

1. **Given** a pre-computed external snapshot in the supported format, **When** an admin imports it, **Then** it becomes a review snapshot with assignments, conflicts, and summary metrics.
2. **Given** imported files that disagree on run identity or row counts, **When** an admin imports them, **Then** the app warns about the mismatch before creating the snapshot.

### Edge Cases

- Uploaded input is incomplete, malformed, or internally inconsistent (e.g., a club in wishes with no hall capacity).
- A wishes PDF is scanned/image-only, so text extraction yields little or nothing — the app must tell the user extraction failed (OCR out of scope) and let them paste JSON or upload a structured file instead.
- Pasted wishes JSON (produced by the user's external LLM) does not match the expected schema or is incomplete — the app must report the validation errors and let the user fix it before a run.
- Wishes conflict with a fixed upper-league Rasterzahl (the fixed value must win).
- Same-club teams in one group cannot all meet by Spieltag 3 without worsening hall usage; Spieltag 4 is allowed with a high optimizer penalty and must be visible in the run breakdown, while Spieltag 5+ remains invalid.
- A six-team group is ambiguous after parsing because click-TT may expose the roster size but not whether the official normal 6er or 6er Doppelrunde table should be used; the app must require explicit review before solving.
- A club name differs between wishes, capacity, and assignment inputs.
- Hall capacity is only a guessed/inferred default when a run starts.
- A capacity edit would reduce capacity below the actual number of teams in an already reviewed conflict.
- Two users edit the same club/hall/weekday capacity at once → last-write-wins (no locking); the audit trail records each change. (Rare: few users, ~annual editing.)
- A new snapshot is generated/imported after users already reviewed an older one.
- An optimization run is still pending, fails, times out, is cancelled, or returns a feasible assignment without proof of optimality.
- (Import path) A snapshot has assignments but no conflict file, or a conflict references a team missing from the assignment table.
- A user uploads a non-PDF or a PDF whose content does not match the selected source type; upload/refresh must fail with a clear message and must not silently mark the source as parsed.

## Requirements *(mandatory)*

### Functional Requirements

#### Input Ingestion

- **FR-001**: Authorized users MUST be able to provide club scheduling wishes either as a structured upload (JSON/CSV) or as a PDF.
- **FR-001a**: The primary guided input flow MUST separate source types by user intent: click-TT league URL for group assignments, multi-file upload for wish PDFs, and optional fixed schedule number entry on an input set. Users MUST NOT have to type arbitrary source type strings in the normal flow.
- **FR-001b**: Raster sources and input sets MUST be season-specific. Users MUST be able to select the season in the Raster UI, and data for one season MUST NOT overwrite or hide data for another season.
- **FR-002**: For PDF wishes, the system MUST parse the known fixed-layout wishes PDF deterministically in-app (text extraction via `pdfjs-dist` + layout patterns, per the existing `src/raster/ingest/wishes-pdf.ts`), producing structured clubs/teams marked for user review. The system MUST NOT run an LLM itself. (First release assumes digital/text-based PDFs; OCR for scanned PDFs is out of scope.)
- **FR-002a**: As an optional fallback when the deterministic parser is low-confidence or the PDF layout has drifted, the system MUST offer a ready-made, copyable prompt embedding the extracted PDF text plus the expected JSON schema and instructions, and MUST accept and schema-validate the JSON the user pastes back after running it in an external LLM.
- **FR-003**: The system MUST let a user review and correct wishes — whether parsed from PDF, pasted as JSON, or uploaded structured — before they are used in a generation run, and MUST clearly report schema-validation errors on pasted JSON.
- **FR-004**: Authorized users MUST be able to provide hall capacity via CSV/Excel upload or manual form entry.
- **FR-005**: The system MUST allow a hall capacity value to start as an inferred/guessed default and be corrected later, and MUST distinguish reviewed capacity from inferred/guessed or missing capacity.
- **FR-006**: The system MUST provide search over hall-capacity records by club, hall, and weekday.
- **FR-007**: Authorized users MUST be able to provide the fixed upper-league Rasterzahlen as a PDF, manual entry, or structured upload, and the system MUST treat them as hard constraints that generated assignments never violate.
- **FR-007a**: Fixed Rasterzahlen / fixed schedule numbers are optional. Validation and run start MUST support zero fixed numbers when all other required inputs are present.
- **FR-008**: The system MUST validate an input set for completeness and schema before a run and surface clear errors for missing or malformed inputs.
- **FR-008a**: The system MUST include a group-review step before validation/run start. For every six-team group, an admin MUST explicitly select `normal 6er` or `6er Doppelrunde`; this selected group mode is persisted in the input set's season model and is passed to the optimizer.
- **FR-008b**: The system MUST model raster geography as a hierarchy of scopes, initially Germany → WTTV → configured WTTV districts, so users and source material can be assigned at the level where they are valid.
- **FR-008c**: The system MUST store raster source documents/links and parsed source caches with an owning scope. A district input set MUST be able to list and use sources from its own district scope and ancestor scopes.
- **FR-008d**: The system MUST allow authorized admins to register or update source metadata and parsed cache content for a selected scope without reparsing or rescraping existing sources.
- **FR-008e**: The system MUST only refresh group assignment and wishes caches when an authorized user explicitly requests a click-TT parse/refresh or uploads/replaces source PDFs or structured source data.
- **FR-008f**: The system MUST let authorized admins delete wrongly registered raster sources. If the source references an app-stored upload, the stored file MUST be removed as part of deletion.
- **FR-008g**: The system MUST validate source files enough to catch obvious mismatches: wish PDF uploads MUST be real PDF files, and explicit parser refresh MUST fail clearly when a source cannot be parsed as its selected source type.
- **FR-008h**: District/scope selection in the UI MUST come from configured Scope records, show or sort by hierarchy, and include WTTV plus all configured WTTV districts rather than relying on free-text district entry.

#### Generation / Optimization

- **FR-009**: Admin users MUST be able to start an optimization run from a reviewed input set.
- **FR-009a**: The Raster preparation UI MUST guide admins through the next required action: register/refresh group source, upload/refresh wishes, create input set, review optional fixed schedule numbers, validate, start run, and open results.
- **FR-010**: The system MUST process optimization runs asynchronously — by invoking the existing Rasterzahl optimizer as a background job (not a reimplemented solver) — so users can continue reviewing existing snapshots while a run is pending. The app prepares the optimizer's input from the reviewed input set and ingests its output into the snapshot model.
- **FR-011**: Each completed run MUST report one of these outcomes: proven optimal, feasible but not proven optimal, infeasible, failed, or cancelled.
- **FR-012**: For proven-optimal and feasible runs, the system MUST create a review snapshot containing assignment output, conflict output, objective value, solver status, run settings, and a reference to the input set used.
- **FR-012a**: Completed runs MUST be reachable from the Raster UI through visible status/result links; users MUST NOT need to inspect logs or call APIs manually to find the generated snapshot.
- **FR-013**: The system MUST clearly distinguish proven-optimal assignments from feasible-only or imported heuristic assignments in all snapshot and assignment views.
- **FR-013a**: The system MUST preserve and display the optimizer objective breakdown, including hall overages, fairness, broken relational wishes, Spielwoche misses, and Spieltag-4 same-club derby fallback count. Same-club derbies on Spieltag 5 or later MUST be treated as hard invalid results and must not be persisted as valid generated snapshots.
- **FR-013b**: The optimization pipeline MUST support official 6er, 6er Doppelrunde, and 7/8er groups in addition to 9/10er, 11/12er, and 13/14er groups, using the reviewed group mode and encoded WTTV rulebook tables.

#### Snapshots & Review

- **FR-014**: The system MUST retain snapshots as separate review versions so users can compare or revisit past runs.
- **FR-015**: The system MUST show a conflict overview with total conflicts, total excess, maximum excess, affected club count, and the highest-impact clubs.
- **FR-016**: Users MUST be able to filter conflicts by club, weekday, hall, match week, and excess severity.
- **FR-017**: Each conflict MUST show match week, club, weekday, hall, capacity, actual home-match count, excess, involved teams, and the source snapshot.
- **FR-018**: The system MUST show a per-club conflict summary with overage count and total excess for each affected club.
- **FR-019**: The system MUST show a team assignment view with league, group, club, team, Rasterzahl, assignment status, weekday, hall, start time, and week slot.
- **FR-020**: Users MUST be able to search and filter assignments by club, league, group, team, Rasterzahl, and assignment status.
- **FR-021**: The system MUST distinguish optimized, fixed, pinned, and missing assignment states wherever assignments are displayed.
- **FR-022**: When capacity or input data changes after a snapshot was produced, the system MUST mark affected conflict and summary views as stale until a newer snapshot is generated/imported.
- **FR-023**: Users MUST be able to mark a conflict or club summary as reviewed, needs data correction, or accepted as unavoidable.
- **FR-024**: The system MUST provide clear empty and error states for missing snapshots, no conflicts, run/import failures, and permission-denied actions.
- **FR-025**: The system MUST let users scope review to a selected district so that a single conflict/assignment/capacity view stays at district scale (hundreds of rows) even when the underlying data spans multiple districts (up to county-wide, ~1,400 clubs/teams).
- **FR-025a**: A user assigned to a parent scope, such as WTTV, MUST be authorized for child district review such as OWL according to their role; a child-scope assignment MUST NOT grant access to unrelated sibling districts.

#### Roles, Audit & Import

- **FR-026**: The system MUST support at least three permission levels: admin, scheduler, and viewer.
- **FR-027**: Admin users MUST be able to upload inputs, start runs, manage users, edit capacity, and review all data.
- **FR-028**: Scheduler users MUST be able to review snapshots and edit capacity but MUST NOT be able to manage users or start runs.
- **FR-029**: Viewer users MUST be able to inspect snapshots, assignments, and conflicts but MUST NOT be able to upload inputs, start runs, or edit review data.
- **FR-030**: The system MUST keep an audit trail of input uploads, run starts, capacity edits, and review-status changes, including who performed the action and when.
- **FR-031**: The system MAY (later phase) import a pre-computed external optimizer snapshot into the same review model, warning users when imported files disagree on snapshot identity or row counts.

### Key Entities *(include if feature involves data)*

- **User**: A person who signs into the app, with permissions via a role.
- **Role**: A permission level (admin, scheduler, viewer) governing upload, run, capacity edit, review, and user management.
- **Input Set**: A named collection of the wishes, hall capacities, and fixed upper-league Rasterzahlen used for one generation run.
- **Scope**: A hierarchy node such as Germany, WTTV, or a WTTV district. Users and raster source material may be assigned at the level where they are valid.
- **Raster Source**: A document, link, or parsed cache attached to a Scope, such as a WTTV group PDF or an OWL wishes PDF. Input sets can consume sources from their district and ancestors.
- **Group Review**: A reviewed group roster and mode selection. Six-team groups require an explicit normal-vs-Doppelrunde mode before validation.
- **Wish**: A club's scheduling preference/constraint for its teams (uploaded structured or extracted from PDF, reviewable/correctable).
- **Fixed Rasterzahl (Upper League)**: A pre-set, immovable Rasterzahl an upper-league team already holds; a hard constraint on generation.
- **Hall Capacity**: The reviewed, inferred/guessed, or missing maximum number of parallel home matches for one club, hall, and weekday.
- **Optimization Run**: A requested calculation from an input set, with status, settings, objective value, and final outcome.
- **Optimizer Snapshot**: A saved review version of one run (generated or imported), including summary metrics, objective breakdown, assignment output, and conflict output.
- **Conflict**: A hall-capacity overage for one club, hall, weekday, and match week.
- **Assignment**: A team-to-Rasterzahl result with context (league, group, club, weekday, hall, assignment status).
- **Review Decision**: A user-entered status and optional note for a conflict or club summary.
- **Audit Event**: A record of a significant user action during upload, run, review, or capacity editing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can go from a complete input set to a started generation run in under 2 minutes, without editing files by hand.
- **SC-002**: Every wish from pasted JSON (or a structured upload) is shown for review and can be corrected before it is used in a run (100% reviewable), and invalid pasted JSON is rejected with a clear schema error.
- **SC-003**: A generated assignment never violates a fixed upper-league Rasterzahl (0 violations in acceptance testing).
- **SC-004**: A scheduler can identify the top 10 clubs by total excess within 30 seconds of opening a snapshot.
- **SC-005**: A scheduler can drill from a club summary to the exact match weeks and teams causing its conflicts in under 3 clicks.
- **SC-006**: At least 95% of conflict rows are visible with their club, hall, weekday, match week, capacity, actual count, excess, and teams.
- **SC-007**: A scheduler can find a specific team's Rasterzahl assignment within 15 seconds using search or filters.
- **SC-008**: A user can find a specific club/hall/weekday capacity record within 15 seconds using search.
- **SC-009**: Role checks prevent 100% of non-authorized capacity edits, input uploads, run starts, and user-management actions during acceptance testing.
- **SC-010**: After a capacity or input edit, all affected snapshot views visibly indicate stale review data before the user can treat the old conflicts as final.
- **SC-011**: Input validation identifies mismatched or incomplete input sets before a run starts.
- **SC-011a**: A run cannot start while any six-team group lacks a reviewed mode, and a generated six-team Doppelrunde assignment uses the Doppelrunde rulebook table for penalties, conflicts, and derby display.
- **SC-011b**: An OWL admin can see WTTV-level source material in the OWL preparation flow within 5 seconds, while source records remain visibly associated with WTTV.
- **SC-011c**: Reopening an existing input set does not reparse click-TT or PDF sources unless the user explicitly requests refresh or uploads replacement source material.
- **SC-011d**: An admin can select any configured WTTV district from a hierarchy-sorted selector without typing the district code by hand.
- **SC-011e**: An admin can remove an incorrectly uploaded source in under 30 seconds, and the source no longer appears in the preparation flow after refresh.
- **SC-011f**: A non-PDF file selected as a wish PDF is rejected before it becomes a stored raster source.
- **SC-012**: At least 95% of completed runs display their final outcome, objective value, and generated snapshot link without manual log inspection.
- **SC-013**: Users can distinguish proven-optimal, feasible-only, and imported heuristic snapshots within 5 seconds of opening a snapshot.
- **SC-014**: If a generated snapshot uses any Spieltag-4 same-club derby fallback, a scheduler can see the count and affected objective component within 5 seconds of opening the snapshot; no Spieltag-5-or-later same-club derby is stored as a valid generated snapshot.

## Assumptions

- The app owns the full pipeline: upload raw inputs → generate → review. Importing a pre-computed external snapshot is an optional later path that reuses the review layer.
- Raw inputs arrive today mostly as PDFs (wishes, fixed upper-league Rasterzahlen). Structured versions may become available; the app supports both. Wishes PDFs share a fixed layout, so the app parses them deterministically in-app (existing `pdfjs-dist`-based `src/raster/ingest/wishes-pdf.ts`); an external-LLM prompt/paste path is only an optional fallback. The app runs no LLM server-side.
- Wishes PDFs are digital/text-based and fixed-layout for the first release; OCR of scanned PDFs is out of scope until a real need appears.
- Capacity editing is infrequent (few users, roughly annual), so last-write-wins with an audit trail is sufficient; no locking or merge workflow is needed.
- Hall capacity volume is manageable via CSV/Excel or forms; guessed defaults are acceptable as a starting point and are later corrected.
- Fixed upper-league Rasterzahlen are few and may be entered manually.
- The existing Rasterzahl optimizer is reused as a background job; the app is responsible for input preparation, job orchestration, and output ingestion, not for the solver itself.
- User login, user administration, and basic role management are provided by the existing internal application baseline (webapp-template).
- Reviewed capacity and input data are maintained separately from snapshots so old snapshots remain historically understandable.
- First release targets district scale (hundreds of assignments/conflicts per snapshot). The data model should not preclude later county-wide scale (~1,400 clubs/teams) with district-scoped views.
- WTTV-level sources may apply to multiple districts. Source ownership follows the administrative level where the document or link is valid; input sets consume inherited sources instead of duplicating them per district.
- Group assignments normally come from click-TT league page URLs for a selected season. Group-assignment file upload is an advanced fallback, not the expected admin path.
- Fixed Rasterzahlen are optional hard constraints, not required input. The app can optimize a season/district with no pre-fixed schedule numbers.
- Desktop/tablet review is the primary workflow for the first release; mobile is useful but secondary.
- A new snapshot is required after capacity/input edits before conflict counts can be considered final.
</content>
</invoke>
