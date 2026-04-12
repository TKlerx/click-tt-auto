# Tasks: Match Report Auto-Approval

**Input**: Design documents from `specs/001-match-auto-approval/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/command-schema.md

**Tests**: Unit tests for validation logic only (core safety-critical code).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and configuration

- [X] T001 Initialize Node.js project with package.json (name: click-tt-automation, scripts: approve, test, typecheck, lint, validate)
- [X] T002 [P] Configure TypeScript strict mode in tsconfig.json
- [X] T003 [P] Configure ESLint in eslint.config.mjs
- [X] T004 [P] Configure Prettier in .prettierrc
- [X] T005 [P] Create .env.example with CLICK_TT_USERNAME, CLICK_TT_PASSWORD, CLICK_TT_URL
- [X] T006 [P] Create .gitignore (node_modules, reports/, .env, dist/)
- [X] T007 Install dependencies: playwright, dotenv, minimist, typescript, vitest, eslint, prettier
- [X] T008 Run `npx playwright install chromium`
- [X] T009 [P] Create validate.ps1 script (typecheck + lint + test)
- [X] T010 Create shared types in src/types.ts (MatchEntry, MatchDetail, TeamLineup, Player, ValidationResult, ValidationCheck, MatchAction, RunReport per data-model.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T011 Implement config loader in src/config.ts - parse CLI args (--dry-run, --group, --headed, --report-dir) and load .env credentials
- [X] T012 Implement login flow in src/auth.ts - navigate to base URL, fill username/password, submit, verify login success by checking for content-row1 or welcome text
- [X] T013 Implement navigation helpers in src/navigation.ts - navigate to SpielbetriebKontrolle -> Begegnungen, check Genehmigung filter checkbox, optionally select group, click Suchen
- [X] T014 Implement match list parser in src/match-list.ts - parse the result table rows extracting: date, homeTeam, guestTeam, scores, status, isApproved, erfassen link URL, group header. Skip matches where status is not "abgeschlossen" at parse time. Skip matches where isApproved is true.
- [X] T015 Implement pagination in src/match-list.ts - detect total pages from "X gefunden | Seite Y / Z", navigate to next page via page number links
- [X] T016 Implement match detail parser in src/match-detail.ts - detect match format from page heading, parse both team lineup tables, parse Bemerkungen text for MF mentions, check for unexpected content between the top button row and the Kontrolle fieldset, and detect whether "Spielbericht genehmigt" is already checked
- [X] T017 Implement validator in src/validator.ts - apply all validation rules and return ValidationResult with per-check pass/fail and human-readable failure reasons
- [X] T018 Implement reporter in src/reporter.ts - generate human-readable stdout output and write JSON report to reports/ directory per contracts/command-schema.md format

**Checkpoint**: Foundation ready - all parsing, validation, and reporting modules exist

---

## Phase 3: User Story 1 - Full Auto-Approval Run (Priority: P1)

**Goal**: Run a single command that logs in, finds all unapproved matches, validates each one, approves the valid ones, and produces a summary report.

**Independent Test**: Run tool against live click-TT, verify matches are approved and skipped correctly, JSON report is generated.

### Tests for User Story 1

- [X] T019 [P] [US1] Unit tests for validator in tests/unit/validator.test.ts - test all rules with mock MatchDetail data
- [X] T020 [P] [US1] Unit tests for match detail parser in tests/unit/match-detail.test.ts - test HTML parsing with sample page fragments
- [X] T021 [P] [US1] Unit tests for match list parser in tests/unit/match-list.test.ts - test row parsing, already-approved detection, and pagination

### Implementation for User Story 1

- [X] T022 [US1] Implement approver in src/approver.ts - check "Spielbericht genehmigt", click "Speichern", click "Zurück zur Einstiegsseite", or click "Abbrechen" when validation fails
- [X] T023 [US1] Implement main orchestrator in src/index.ts - wire together config, auth, navigation, page iteration, validation, approval, skipping, and reporting
- [X] T024 [US1] Add progress logging to src/index.ts - log each match action with team names as it processes
- [X] T025 [US1] Add error recovery in src/index.ts - catch per-match errors, log them, attempt to navigate back, and continue

**Checkpoint**: Full auto-approval run works end-to-end. Can approve all clean matches and skip problematic ones with a report.

---

## Phase 4: User Story 2 - Dry Run Mode (Priority: P2)

**Goal**: Run in dry-run mode to see what WOULD be approved without making changes.

**Independent Test**: Run with `--dry-run`, verify no checkboxes are clicked, no Speichern is pressed, report is generated with a dry-run marker.

### Implementation for User Story 2

- [X] T026 [US2] Add dry-run flag handling in src/approver.ts - when dryRun is true, parse and validate but skip clicking checkbox and Speichern, then click Abbrechen
- [X] T027 [US2] Update reporter in src/reporter.ts - prefix stdout output with a dry-run mode indicator and mark JSON report with `"dryRun": true`

**Checkpoint**: Dry-run mode works. No changes made to click-TT, full report generated.

---

## Phase 5: User Story 3 - Configurable Group Filter (Priority: P3)

**Goal**: Filter by specific group when running the tool.

**Independent Test**: Run with `--group "Bezirksoberliga Erwachsene"` and verify only that group is processed.

### Implementation for User Story 3

- [X] T028 [US3] Add group selection in src/navigation.ts - when --group is provided, select the matching option from the Gruppe dropdown before clicking Suchen
- [X] T029 [US3] Update reporter in src/reporter.ts - include selected group name in stdout header and JSON report

**Checkpoint**: Group filtering works. Only selected group's matches are processed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and robustness improvements

- [X] T030 [P] Add session expiry detection in src/auth.ts - detect if redirected to login page mid-run and abort gracefully
- [X] T031 [P] Add match format detection in src/match-detail.ts - check page heading for "Sechser-Paarkreuz-System" and report unsupported formats
- [X] T032 [P] Create README.md with setup instructions, usage examples, and explanation of validation rules
- [X] T033 Run validate.ps1 and fix any typecheck/lint issues
- [ ] T034 Manual end-to-end test: run --dry-run against live click-TT, review report, then run live and verify approvals in the webapp
- [X] T035 Add explicit detail-page safety guards, headed debug mode, and halt-for-inspection behavior
- [X] T036 Improve detail parsing for nested / side-by-side lineup tables and acceptable bottom-of-page Hinweise
- [X] T037 Add richer progress reporting (overall/page/item progress, ETA, plain-progress fallback)
- [X] T038 Extend stdout/JSON reporting with scanned/actionable/ignored counts and fine-workbook sync summary
- [X] T039 Implement fine workbook sync in src/fines.ts using ExcelJS with duplicate suppression and ignore-column support
- [X] T040 Export `Nicht angetreten` fine candidates and workbook failure reasons, including already-approved search-result rows

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2)
- **User Story 2 (Phase 4)**: Depends on User Story 1
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 only - core MVP
- **User Story 2 (P2)**: Depends on US1
- **User Story 3 (P3)**: Depends on Phase 2 only - independent of US1/US2

### Within Each User Story

- Tests can be written in parallel [P]
- Implementation tasks are sequential
- Story complete when checkpoint passes

### Parallel Opportunities

- T002, T003, T004, T005, T006 can run in parallel
- T019, T020, T021 can run in parallel
- US1 and US3 can run in parallel after Phase 2
- T030, T031, T032 can run in parallel

---

## Notes

- [P] tasks = different files, no dependencies
- Safety is paramount: when in doubt, skip and report
- Test against live click-TT with --dry-run before running live
