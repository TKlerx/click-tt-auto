# Feature Specification: Match Report Auto-Approval

**Feature Branch**: `001-match-auto-approval`  
**Created**: 2026-04-10  
**Status**: In Progress  
**Input**: User description: "Automate the approval of table tennis match reports in click-TT admin (WTTV) for the Staffelleiter role"

## Context

The click-TT admin webapp (https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa) is used by league organizers (Staffelleiter) to review and approve match reports. The webapp is stateful — URLs contain incrementing counters, the browser back button does not work reliably, and each approval requires ~7 clicks through multiple pages. With ~284 unapproved matches per season across 10 pages, this is extremely tedious when ~90% of matches are straightforward auto-approvable.

The same run should also reduce the remaining manual follow-up work. Skipped matches often need to be reviewed for fines, so the tool should optionally append missing fine candidates to an existing Excel workbook, including `Nicht angetreten` rows taken directly from the search results.

### Target Webapp Characteristics
- **Stateful URLs**: Counter embedded in URL path (e.g., `/wo/8.0.63.3.5.1.1.3.37.1`), increments with each navigation
- **No back button**: Must navigate forward or use explicit "Zurück" links
- **Session-based**: Login required, session may expire
- **Pagination**: ~30 matches per page, 10+ pages
- **Filter persistence**: Genehmigung filter checkbox persists across page navigations within the same session

## User Scenarios & Testing

### User Story 1 - Full Auto-Approval Run (Priority: P1)

As a Staffelleiter, I want to run a single command that logs into click-TT, finds all unapproved matches, checks each one against the approval rules, approves the valid ones, and gives me a summary of what happened — so I don't have to click through hundreds of matches manually.

**Why this priority**: This is the entire purpose of the tool. Without this, the tool has no value.

**Independent Test**: Can be tested by running the tool against the live click-TT system and verifying that matches are approved and a report is generated.

**Acceptance Scenarios**:

1. **Given** valid credentials and unapproved matches exist, **When** the tool is run, **Then** it logs in, navigates to Begegnungen, filters for unapproved matches, and iterates through all pages.
2. **Given** a match with status "abgeschlossen", MF present (in lineup table or Bemerkungen) for both teams, 6 players (1-6) for both teams, and no red text at the top of the detail page, **When** the tool evaluates it, **Then** it checks "Spielbericht genehmigt" and clicks "Speichern".
3. **Given** a match that fails any validation check, **When** the tool evaluates it, **Then** it clicks "Abbrechen" and records the match with the failure reason.
4. **Given** the tool completes a run, **When** it finishes, **Then** it prints a summary to stdout showing: total matches, approved count, skipped count, and a list of skipped matches with reasons.

---

### User Story 2 - Dry Run Mode (Priority: P2)

As a Staffelleiter, I want to run the tool in dry-run mode to see what it WOULD approve/skip without actually making changes — so I can verify the rules are correct before letting it loose.

**Why this priority**: Safety net for first-time use and rule verification.

**Independent Test**: Run with `--dry-run` flag, verify no checkboxes are clicked and no "Speichern" is pressed, but the report is still generated.

**Acceptance Scenarios**:

1. **Given** `--dry-run` flag is set, **When** the tool processes matches, **Then** it navigates to each match detail page and evaluates all rules but does NOT check the approval checkbox or click Speichern.
2. **Given** `--dry-run` flag is set, **When** the tool finishes, **Then** the summary report is identical in format to a real run, clearly marked as "[DRY RUN]".

---

### User Story 3 - Configurable Group Filter (Priority: P3)

As a Staffelleiter managing multiple groups (Bezirksoberliga, 1. Bezirksliga 1, 1. Bezirksliga 2), I want to optionally filter by a specific group — so I can approve matches for one league at a time.

**Why this priority**: Nice-to-have for targeted runs, but "Alle meine Gruppen" works as default.

**Independent Test**: Run with `--group "Bezirksoberliga Erwachsene"` and verify only that group's matches are processed.

**Acceptance Scenarios**:

1. **Given** no group flag, **When** the tool runs, **Then** it uses "Alle meine Gruppen" (default).
2. **Given** `--group "Bezirksoberliga Erwachsene"`, **When** the tool runs, **Then** it selects that group in the filter dropdown before searching.

---

### User Story 4 - Fine Workbook Sync (Priority: P2)

As a Staffelleiter, I want skipped matches and `Nicht angetreten` cases to be appended to my Excel fine workbook — so I do not need to manually transfer every issue from the run report into my season ledger.

**Why this priority**: This removes the main bookkeeping work that remains after the approval pass.

**Independent Test**: Run the tool with a configured workbook path, verify that missing rows are appended once, existing rows are not duplicated, ignored false positives stay suppressed, and `Nicht angetreten` rows are exported even when click-TT already shows them as approved.

**Acceptance Scenarios**:

1. **Given** a configured fine workbook and a skipped match, **When** the run completes, **Then** the tool appends a row only if the same fine candidate is not already present or marked ignored.
2. **Given** a `Nicht angetreten` row on the search results page, **When** the run completes, **Then** the tool appends a fine candidate with `Grund = Nicht angetreten`, even if the row already has a checkmark in click-TT.
3. **Given** a skipped match with concrete failure reasons, **When** the fine row is appended, **Then** the workbook `Bemerkung` contains the human-readable reason(s) that caused auto-approval to fail.

---

### Edge Cases

- **Session expiry**: What if the session expires mid-run? Tool should detect login page redirect and either re-login or abort gracefully with a clear error.
- **Empty match list**: No unapproved matches found → tool reports "0 matches found" and exits cleanly.
- **Network timeout**: Playwright page load timeout → skip current match, log error, continue with next.
- **Match already approved by someone else**: If the "Spielbericht genehmigt" checkbox is already checked when entering a match → skip it (already done).
- **`Nicht angetreten` with checkmark**: A row may already show a checkmark in click-TT but still needs to be present in the fine workbook. Approval processing should skip it, but workbook export should still consider it.
- **Unexpected page structure**: If the detail page doesn't match expected structure (e.g., different Paarkreuz system) → skip and log.
- **Duplicate fine candidates**: Workbook sync should be append-only and suppress duplicates based on match identity and sanction reason.

## Requirements

### Functional Requirements

- **FR-001**: System MUST authenticate with click-TT using provided credentials (username + password via environment variables)
- **FR-002**: System MUST navigate to Spielbetrieb Kontrolle → Begegnungen
- **FR-003**: System MUST check "nur noch nicht genehmigte Begegnungen anzeigen" and click "Suchen"
- **FR-004**: System MUST iterate through ALL pages of results sequentially (page 1→2→3...). On each page, skip matches that already show a checkmark for auto-approval purposes. Track processed matches internally to avoid re-processing if the same match appears again.
- **FR-005**: System MUST skip matches where Status is NOT "abgeschlossen" on the list page for approval purposes. `Nicht angetreten` rows may still be collected for optional fine-workbook export.
- **FR-006**: System MUST open each "abgeschlossen" match via the "erfassen" link
- **FR-007**: System MUST check for ANY text content between the top button row (Abbrechen / << Zurück / Speichern) and the "Kontrolle" fieldset/table heading. Known errors use `<p class="error-msg">`, but any text in that region indicates an issue. If any content is found there, the match is NOT auto-approvable. Text below the tables (e.g., "Hinweis(e) zur Genehmigung") is acceptable and should be ignored. If DOM structure is unexpected, skip the match (safe default).
- **FR-008**: System MUST verify MF (Mannschaftsführer) is present for BOTH teams — either as an "MF" row in the lineup table OR mentioned in the "Bemerkungen" section
- **FR-009**: System MUST verify 6 players (entries numbered 1-6) are present in BOTH team lineup tables
- **FR-010**: System MUST only check "Spielbericht genehmigt" and click "Speichern" when ALL validation checks pass
- **FR-011**: System MUST click "Abbrechen" when any validation check fails, returning to the list without making changes
- **FR-012**: System MUST click "Zurück zur Einstiegsseite" after saving, to return to the filtered match list
- **FR-013**: System MUST produce a detailed summary report in two formats: (1) human-readable summary to stdout for immediate feedback, and (2) a JSON report file (e.g., `report-2026-04-10.json`) for later reference. The summary must distinguish between total rows found, scanned rows, actionable rows, ignored rows, approved count, skipped count, already-approved count, and errors. For each skipped match, the report must include home team, guest team, date, and specific reason(s) for skipping (e.g., "guest has 5 numbered players", "MF missing for both teams", "error message found: falsche Aufstellung"). This report is critical for the Staffelleiter to handle skipped matches manually.
- **FR-014**: System MUST support `--dry-run` flag that evaluates all rules without approving
- **FR-015**: System MUST support `--group` flag to filter by specific group
- **FR-016**: System MUST support `--headed` flag to run with visible browser (default: headless)
- **FR-017**: System MUST support an optional Excel fine workbook configuration via environment variables. When configured, the tool MUST append missing fine candidates to that workbook instead of generating a separate spreadsheet per run.
- **FR-018**: System MUST derive `Liga` and `Gruppe` for workbook export from the match detail page when that metadata is available there, and use configured fallbacks only when the page does not expose clean values.
- **FR-019**: System MUST append `Nicht angetreten` fine candidates from the search results page even when the click-TT row is already marked approved, provided the workbook does not already contain the corresponding entry and it is not marked ignored.
- **FR-020**: System MUST write the failure reason(s) for skipped matches into the workbook `Bemerkung` column so the Staffelleiter can understand why the match was not auto-approved.
- **FR-021**: System MUST support an ignore column in the workbook so known false positives can be suppressed on later runs.
- **FR-022**: System MUST support a configurable fine amount for `Nicht angetreten` workbook rows.

### Key Entities

- **Match (Begegnung)**: A table tennis match between two teams, with date, home team, guest team, score, status, and approval state
- **Team Lineup**: List of 6 numbered players (1-6) plus MF (Mannschaftsführer) and doubles pairings (D1-D3)
- **Validation Result**: Per-match result indicating pass/fail for each rule, with failure reasons
- **Fine Candidate**: A workbook row candidate derived from a skipped match or a `Nicht angetreten` result

## Navigation Flow

```
1. Login page
   → Enter username + password → Submit
2. Home page (after login)
   → Click "SpielbetriebKontrolle"
3. Spielbetrieb Kontrolle page
   → Click "Begegnungen"
4. Begegnungen filter page
   → Check "nur noch nicht genehmigte Begegnungen anzeigen"
   → Optionally select Gruppe
   → Click "Suchen"
5. Match list page (paginated, ~30 per page)
   → For each match with status "abgeschlossen":
     → Click "erfassen"
   → For each match with status "nicht angetreten":
     → Record optional fine candidate for workbook export
6. Match detail page (Kontrolle tab)
   → Check: no red text at top
   → Check: MF present for both teams (table or Bemerkungen)
   → Check: 6 players (1-6) for both teams
   → If ALL pass: check "Spielbericht genehmigt" → click "Speichern"
     → Click "Zurück zur Einstiegsseite" (returns to filtered list)
   → If ANY fail: click "Abbrechen" (returns to list)
   → Continue with next match on list
   → After last match on page: navigate to next page
   → Repeat until all pages processed
7. Print summary report
8. If workbook sync is configured:
   → Append missing fine candidates
   → Skip workbook rows already present or marked ignored
```

## Success Criteria

### Measurable Outcomes

- **SC-001**: Tool successfully approves all auto-approvable matches in a single run (zero false negatives for clean matches)
- **SC-002**: Tool never approves a match that fails any validation rule (zero false positives)
- **SC-003**: Full run of ~284 matches completes in under 30 minutes
- **SC-004**: Summary report accurately lists all skipped matches with correct reasons
- **SC-005**: Tool handles session issues and network errors without crashing
- **SC-006**: Workbook sync never creates duplicate fine rows for the same match and sanction reason
- **SC-007**: `Nicht angetreten` workbook rows are captured even if click-TT already shows the result as approved

## Clarifications

### Session 2026-04-10

- Q: How should the tool detect "red text at the top"? → A: Check for ANY text content between the top button row (Abbrechen / << Zurück / Speichern) and the "Kontrolle" fieldset/table. Known error elements use `<p class="error-msg">`, but any unexpected text in that region should also trigger a skip. In case of doubt, skip the match (safe default).
- Q: What should happen when a match has fewer than 6 players (e.g., walkover/nicht angetreten)? → A: Always skip — no exceptions. The summary report must list these with the specific reason so the Staffelleiter can handle them manually.
- Q: Should `Nicht angetreten` rows still be exported to the fine workbook when the search result already shows a checkmark? → A: Yes. Approval processing should skip them, but workbook sync should still append the sanction row if it is missing from Excel.
- Q: What should be written to the fine workbook for skipped matches? → A: Use the sanction reason as `Grund` where appropriate and include the concrete auto-approval failure reason(s) in `Bemerkung`.
- Q: How should the tool handle pagination after approving matches? → A: Process pages sequentially (1→2→3...). Approved matches stay in the current search results with a checkmark — use this to skip already-approved ones. Track visited-and-skipped matches internally to avoid re-processing. Approved matches only disappear on a new search, so no need to re-search between pages.
- Q: Should the summary report be written to a file or just printed to stdout? → A: Both. Human-readable summary to stdout for immediate feedback, plus a JSON file (e.g., `report-2026-04-10.json`) for later reference and run history.
- Q: Should the tool support match formats other than Sechser-Paarkreuz-System? → A: Stage 1: Sechser-Paarkreuz only (6 players per team). Stage 2 (future): add Vierer-Paarkreuz support (4 players per team). For now, skip matches that don't match Sechser format.

## Assumptions

- User has a valid click-TT admin account with Staffelleiter permissions for the configured Meisterschaft
- The click-TT webapp structure (HTML, form names, navigation flow) remains stable between runs
- Stage 1 only supports "Sechser-Paarkreuz-System" (6 players per team). Matches using other formats (e.g., Vierer-Paarkreuz) should be detected and skipped. Vierer-Paarkreuz support is planned for Stage 2.
- The tool runs on Windows (primary development environment)
- Node.js LTS is installed
- Internet connection is available to reach wttv.click-tt.de
