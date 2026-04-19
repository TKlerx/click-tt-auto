# click-tt-automation

Playwright-based CLI automation for click-TT administration.

It is used to:

- review match reports in click-TT
- automatically approve reports that match the expected Bezirksoberliga/league rules
- skip suspicious or non-conforming reports safely instead of clicking unknown pages
- sync fine candidates into an Excel workbook for follow-up processing

The current implementation lives on `main` and uses TypeScript plus Playwright. The old Selenium-based approach is kept only as historical reference on the legacy `master` branch.

## What It Does

On each run, the tool logs into the click-TT admin area, opens the `Begegnungen` search, scans the result pages, and then decides per match whether it should:

- be approved automatically
- be skipped with a concrete reason
- be reported as an error because the page shape was unexpected
- be added to the fine workbook as a missing fine candidate

The automation is intentionally conservative. If a page does not look like the expected click-TT structure, it prefers stopping or skipping over pressing uncertain controls.

## Setup

```bash
npm install
npx playwright install chromium
```

Create or update `.env` with your credentials:

```bash
CLICK_TT_USERNAME=your-click-tt-username
CLICK_TT_PASSWORD=your-click-tt-password
CLICK_TT_URL=https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa
CLICK_TT_FINE_WORKBOOK_PATH=data/2025-2026 - Ordnungsstrafen BOL 1BL.xlsx
CLICK_TT_FINE_SHEET_NAME=Sheet1
CLICK_TT_FINE_IGNORE_COLUMN=Ignore
```

Optional fine-workbook settings:

- `CLICK_TT_FINE_WORKBOOK_PATH`: when set, skipped fine candidates and `nicht angetreten` rows are synced into the workbook
- `CLICK_TT_FINE_SHEET_NAME`: target worksheet; defaults to the first sheet
- `CLICK_TT_FINE_IGNORE_COLUMN`: column used to suppress known false positives on future runs
- `CLICK_TT_FINE_SPIELLEITER`: default value for the `Spielleiter` column on appended rows
- `CLICK_TT_FINE_DEFAULT_LIGA` / `CLICK_TT_FINE_DEFAULT_GRUPPE`: fallback values when the list page does not expose a clean group name
- `CLICK_TT_FINE_NA_KOSTEN`: fine amount used for appended `Nicht angetreten` rows

## Recommended Run Order

### How To Run

1. Install dependencies once:

```bash
npm install
npx playwright install chromium
```

2. Create a local `.env` file, for example by copying `.env.example`, and fill in your click-TT credentials.

3. Start with a safe dry run:

```bash
npm run approve -- --dry-run
```

4. If you want to watch the browser while checking behavior:

```bash
npm run approve -- --dry-run --headed
```

5. If the dry run looks correct, run the real approval:

```bash
npm run approve --
```

Recommended everyday workflow:

- use `npm run approve -- --dry-run` to verify what would happen
- use `npm run approve --` only after the dry run looks right
- use `npm run approve -- --debug` when you need slow motion, extra diagnostics, and browser inspection on errors

## Usage

```bash
npm run approve
npm run approve -- --dry-run
npm run approve -- --headed
npm run approve -- --debug
npm run approve -- --debug --no-halt-on-error
npm run approve -- --dry-run --process-all
npm run approve -- --dry-run --headed --slow-mo 1500
npm run approve -- --group "Bezirksoberliga Erwachsene"
```

## CLI Parameters

- `--dry-run`: validate matches and fine-workbook candidates without writing changes to click-TT or the Excel workbook
- `--debug`: enable headed mode, slow motion, extra diagnostics, and fatal-page inspection by default
- `--headed`: show the Chromium browser without enabling the rest of debug mode
- `--halt-on-error`: pause headed runs on fatal page-shape errors and keep the browser open
- `--no-halt-on-error`: continue after fatal page-shape errors even in debug mode
- `--plain-progress`: use plain line-by-line progress output instead of the redrawn progress bar
- `--process-all`: open every match row detail page instead of only approval-relevant/fine-relevant rows
- `--slow-mo <ms>`: add a delay between Playwright actions; in debug mode the effective minimum is `1200`
- `--group "<name>"`: restrict the run to a specific click-TT group label
- `--report-dir <path>`: write JSON reports and debug HTML snapshots to a custom directory

`--debug` is a convenience mode for investigation runs:

- forces a visible browser window
- slows Playwright actions down so you can follow the UI
- keeps the browser open on fatal errors until you press Enter in the terminal

If you want the headed/slow debug behavior without stopping on fatal pages, use `--debug --no-halt-on-error`.

## Validation Rules

The tool approves only when all of these pass:

1. Match format is `Sechser-Paarkreuz-System`.
2. No unexpected text or warning elements appear between the top button row and the `Kontrolle` fieldset.
3. Both teams have an `MF` entry, either in the lineup table or mentioned in `Bemerkungen`.
4. Both teams have exactly six numbered player rows (`1` through `6`).
5. The approval checkbox is not already checked.

When a rule fails, the tool clicks `Abbrechen`, records the reason, and continues with the next match.

This makes the tool suitable for semi-automated league administration: it handles the routine approvals quickly, but leaves unusual, risky, or sanction-relevant matches for manual review.

If a fine workbook is configured, the tool also:

- appends missing fine candidates for skipped matches
- appends missing `Nicht angetreten` rows found on the search results page, even if the row is already marked approved in click-TT
- adds an `Ignore` column when needed so false positives can be suppressed on later runs
- writes `Datum` as a real Excel date value
- adds an `Eingetragen am` column and fills it as a real Excel date/time value for newly appended rows
- writes the auto-approval failure reason into `Bemerkung` for appended skipped-match fines

With `--dry-run`, these workbook candidates are still calculated and reported, but the Excel file is not modified.

## Development

```bash
npm run typecheck
npm run lint
npm test
pwsh -File ./validate.ps1
```
