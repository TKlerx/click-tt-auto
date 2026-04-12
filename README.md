# click-tt-automation

Playwright-based CLI automation for approving click-TT match reports.

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

## Usage

```bash
npm run approve
npm run approve -- --dry-run
npm run approve -- --headed
npm run approve -- --debug
npm run approve -- --debug --no-halt-on-error
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

If a fine workbook is configured, the tool also:

- appends missing fine candidates for skipped matches
- appends missing `Nicht angetreten` rows found on the search results page, even if the row is already marked approved in click-TT
- adds an `Ignore` column when needed so false positives can be suppressed on later runs
- writes the auto-approval failure reason into `Bemerkung` for appended skipped-match fines

With `--dry-run`, these workbook candidates are still calculated and reported, but the Excel file is not modified.

## Development

```bash
npm run typecheck
npm run lint
npm test
pwsh -File ./validate.ps1
```
