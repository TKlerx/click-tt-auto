# Tasks: Match Report Auto-Approval

**Input**: Design documents from `specs/main/`
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

- [ ] T001 Initialize Node.js project with package.json (name: click-tt-automation, scripts: approve, test, typecheck, lint, validate)
- [ ] T002 [P] Configure TypeScript strict mode in tsconfig.json
- [ ] T003 [P] Configure ESLint in eslint.config.mjs
- [ ] T004 [P] Configure Prettier in .prettierrc
- [ ] T005 [P] Create .env.example with CLICK_TT_USERNAME, CLICK_TT_PASSWORD, CLICK_TT_URL
- [ ] T006 [P] Create .gitignore (node_modules, reports/, .env, dist/)
- [ ] T007 Install dependencies: playwright, dotenv, minimist, typescript, vitest, eslint, prettier
- [ ] T008 Run `npx playwright install chromium`
- [ ] T009 [P] Create validate.ps1 script (typecheck + lint + test)
- [ ] T010 Create shared types in src/types.ts (MatchEntry, MatchDetail, TeamLineup, Player, ValidationResult, ValidationCheck, MatchAction, RunReport per data-model.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Implement config loader in src/config.ts — parse CLI args (--dry-run, --group, --headed, --report-dir) and load .env credentials
- [ ] T012 Implement login flow in src/auth.ts — navigate to base URL, fill username/password, submit, verify login success by checking for content-row1 or welcome text
- [ ] T013 Implement navigation helpers in src/navigation.ts — navigate to SpielbetriebKontrolle → Begegnungen, check Genehmigung filter checkbox, optionally select group, click Suchen
- [ ] T014 Implement match list parser in src/match-list.ts — parse the result table rows extracting: date, homeTeam, guestTeam, scores, status, isApproved (detect checkmark indicator in row for already-approved matches), erfassen link URL, group header. Skip matches where status is NOT "abgeschlossen" at parse time (FR-005). Skip matches where isApproved is true (already have checkmark).
- [ ] T015 Implement pagination in src/match-list.ts — detect total pages from "X gefunden | Seite Y / Z", navigate to next page via page number links
- [ ] T016 Implement match detail parser in src/match-detail.ts — detect match format from page heading (must contain "Sechser-Paarkreuz-System"), parse both team lineup tables (MF row, numbered player entries 1 through 6), parse Bemerkungen text for MF mentions, check for ANY text/elements between the top button row (Abbrechen / << Zurück / Speichern) and the "Kontrolle" fieldset (includes `<p class="error-msg">` and any other unexpected content). Also check if "Spielbericht genehmigt" checkbox is already checked.
- [ ] T017 Implement validator in src/validator.ts — apply all validation rules: (1) match format is "Sechser-Paarkreuz-System", (2) no text/elements between buttons and Kontrolle fieldset, (3) MF present for both teams (either MF row in lineup table OR MF mentioned in Bemerkungen), (4) exactly 6 numbered player entries (labeled 1 through 6) in both team lineup tables, (5) checkbox not already checked. Return ValidationResult with per-check pass/fail and human-readable failure reasons.
- [ ] T018 Implement reporter in src/reporter.ts — generate human-readable stdout output and write JSON report to reports/ directory per contracts/command-schema.md format

**Checkpoint**: Foundation ready — all parsing, validation, and reporting modules exist

---

## Phase 3: User Story 1 — Full Auto-Approval Run (Priority: P1) 🎯 MVP

**Goal**: Run a single command that logs in, finds all unapproved matches, validates each one, approves the valid ones, and produces a summary report.

**Independent Test**: Run tool against live click-TT, verify matches are approved and skipped correctly, JSON report is generated.

### Tests for User Story 1

- [ ] T019 [P] [US1] Unit tests for validator in tests/unit/validator.test.ts — test all 4 rules with mock MatchDetail data: pass case, fail-status, fail-error-msg, fail-mf-missing, fail-player-count, fail-multiple-rules, MF-in-Bemerkungen-only
- [ ] T020 [P] [US1] Unit tests for match detail parser in tests/unit/match-detail.test.ts — test HTML parsing with sample page fragments: normal match, missing MF, fewer than 6 players, error message present
- [ ] T021 [P] [US1] Unit tests for match list parser in tests/unit/match-list.test.ts — test row parsing: abgeschlossen, nicht angetreten, already-approved (checkmark), pagination detection

### Implementation for User Story 1

- [ ] T022 [US1] Implement approver in src/approver.ts — check "Spielbericht genehmigt" checkbox, click "Speichern", click "Zurück zur Einstiegsseite". If validation fails, click "Abbrechen" instead.
- [ ] T023 [US1] Implement main orchestrator in src/index.ts — wire together: config → auth → navigation → loop over pages → for each match: check status/checkmark on list → open detail → parse → validate → approve or skip → report. Handle errors per match (catch, log, continue).
- [ ] T024 [US1] Add progress logging to src/index.ts — log each match action ([APPROVED], [SKIPPED], [ALREADY-APPROVED], [ERROR]) with team names as it processes
- [ ] T025 [US1] Add error recovery in src/index.ts — if a match errors mid-processing, catch the error, log it, attempt to navigate back to the list page, and continue with the next match

**Checkpoint**: Full auto-approval run works end-to-end. Can approve all clean matches and skip problematic ones with a report.

---

## Phase 4: User Story 2 — Dry Run Mode (Priority: P2)

**Goal**: Run in dry-run mode to see what WOULD be approved without making changes.

**Independent Test**: Run with `--dry-run`, verify no checkboxes are clicked, no Speichern is pressed, report is generated with "[DRY RUN]" label.

### Implementation for User Story 2

- [ ] T026 [US2] Add dry-run flag handling in src/approver.ts — when dryRun is true, navigate to detail page, parse and validate, but skip clicking checkbox and Speichern. Click Abbrechen to return to list.
- [ ] T027 [US2] Update reporter in src/reporter.ts — prefix stdout output with "[DRY RUN]" mode indicator, mark JSON report with `"dryRun": true`

**Checkpoint**: Dry-run mode works. No changes made to click-TT, full report generated.

---

## Phase 5: User Story 3 — Configurable Group Filter (Priority: P3)

**Goal**: Filter by specific group when running the tool.

**Independent Test**: Run with `--group "Bezirksoberliga Erwachsene"`, verify only that group is processed.

### Implementation for User Story 3

- [ ] T028 [US3] Add group selection in src/navigation.ts — when --group is provided, select the matching option from the Gruppe dropdown before clicking Suchen
- [ ] T029 [US3] Update reporter in src/reporter.ts — include selected group name in stdout header and JSON report

**Checkpoint**: Group filtering works. Only selected group's matches are processed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and robustness improvements

- [ ] T030 [P] Add session expiry detection in src/auth.ts — detect if redirected to login page mid-run, log error and abort gracefully
- [ ] T031 [P] Add match format detection in src/match-detail.ts — check page heading for "Sechser-Paarkreuz-System", skip and report if different format detected
- [ ] T032 [P] Create README.md with setup instructions, usage examples, and explanation of validation rules
- [ ] T033 Run validate.ps1 and fix any typecheck/lint issues
- [ ] T034 Manual end-to-end test: run --dry-run against live click-TT, review report, then run live and verify approvals in the webapp

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2)
- **User Story 2 (Phase 4)**: Depends on User Story 1 (adds dry-run to existing approver)
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) — can run parallel with US1
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 only — core MVP
- **User Story 2 (P2)**: Depends on US1 (modifies approver.ts)
- **User Story 3 (P3)**: Depends on Phase 2 only — independent of US1/US2

### Within Each User Story

- Tests can be written in parallel [P]
- Implementation tasks are sequential (each builds on prior)
- Story complete when checkpoint passes

### Parallel Opportunities

- T002, T003, T004, T005, T006 can all run in parallel (Phase 1 config files)
- T019, T020, T021 can all run in parallel (Phase 3 tests)
- US1 and US3 can theoretically run in parallel after Phase 2
- T030, T031, T032 can all run in parallel (Phase 6 polish)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit tests for validator in tests/unit/validator.test.ts"
Task: "Unit tests for match detail parser in tests/unit/match-detail.test.ts"
Task: "Unit tests for match list parser in tests/unit/match-list.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — all parsing and validation logic)
3. Complete Phase 3: User Story 1 (orchestrator + approver)
4. **STOP and VALIDATE**: Run `--dry-run` manually (before US2 exists, just comment out approval clicks), review report
5. Run live on a small set, verify in click-TT

### Incremental Delivery

1. Setup + Foundational → Core modules ready
2. User Story 1 → Full auto-approval works (MVP!)
3. User Story 2 → Safe dry-run mode added
4. User Story 3 → Group filtering added
5. Polish → Robustness, docs, format detection

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Safety is paramount: when in doubt, skip and report
- Commit after each task or logical group
- Test against live click-TT with --dry-run before running live
