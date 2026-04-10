# Research: Match Report Auto-Approval

## Decision: Browser Automation Framework

**Decision**: Playwright
**Rationale**: Modern, built-in auto-waiting, TypeScript-first, handles the stateful click-TT webapp well. Superior to Selenium (which the old Java code used) in terms of API ergonomics, reliability, and built-in retries.
**Alternatives considered**:
- Selenium (Java) — used in old click-tt-auto project, verbose, requires explicit waits
- Puppeteer — Chrome-only, fewer features than Playwright
- Direct HTTP requests — not feasible due to stateful URL counters and server-side session management

## Decision: Detecting Already-Approved Matches in List

**Decision**: Check for checkmark indicator in each match row on the list page
**Rationale**: Approved matches stay in the current search results with a visual checkmark. This is the most reliable way to skip already-handled matches without re-searching.
**Alternatives considered**:
- Re-search after each approval (matches disappear) — slower, resets pagination
- Track by team names + date — fragile, could miss duplicates

## Decision: Red Text / Error Detection Strategy

**Decision**: Check for ANY text content between the button row (Abbrechen / << Zurück / Speichern) and the "Kontrolle" fieldset. Known errors use `<p class="error-msg">` but any content in that DOM region triggers a skip.
**Rationale**: Safest approach — even unexpected warnings are caught. The region between buttons and the Kontrolle table should be empty on a clean match.
**Alternatives considered**:
- Only check `<p class="error-msg">` — could miss new error types
- Screenshot + color analysis — fragile, slow, unnecessary

## Decision: MF Detection Strategy

**Decision**: Check two locations: (1) "MF" row in the lineup table for each team, (2) text matching "MF" in the Bemerkungen section
**Rationale**: Some matches have MF in the table, others only in Bemerkungen (manually entered). Both are valid.
**Alternatives considered**:
- Only check lineup table — would miss valid matches like SC Wewer vs TTS Detmold

## Decision: Match Format Detection

**Decision**: Detect "Sechser-Paarkreuz-System" in the page heading. If different format detected, skip match and report.
**Rationale**: Stage 1 only supports 6-player format. The page heading explicitly states the system (e.g., "Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)").
**Alternatives considered**:
- Count players to infer format — less explicit, could misidentify incomplete lineups

## Decision: CLI Argument Parsing

**Decision**: minimist (lightweight) or Node.js built-in `parseArgs` (Node 18.3+)
**Rationale**: Only need a few flags (--dry-run, --group, --headed). No need for a heavy framework like commander or yargs.
**Alternatives considered**:
- commander/yargs — overkill for 3-4 flags
- Manual parsing — error-prone

## Decision: Project Scaffolding

**Decision**: Borrow quality tooling from webapp-template (validate.ps1, ESLint, Prettier, TypeScript config, git hooks) but NOT the Next.js/Prisma/auth stack.
**Rationale**: The webapp-template has battle-tested quality gates. The application logic is completely different (CLI tool vs webapp), so only the tooling layer is reusable.
**Alternatives considered**:
- Start from scratch — would miss validate.ps1 and pre-commit hooks
- Use full webapp-template — massive overkill, would need to delete 95% of it
