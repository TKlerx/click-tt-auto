# Quickstart: click-TT Match Auto-Approval

## Prerequisites

- Node.js LTS (22.x+)
- npm

## Setup

```bash
# Clone and install
git clone <repo-url>
cd click-tt-automation
npm install

# Install Playwright browsers
npx playwright install chromium

# Configure credentials
cp .env.example .env
# Edit .env with your click-TT credentials
```

Recommended `.env` additions for fine tracking:

```bash
CLICK_TT_FINE_WORKBOOK_PATH=data/2025-2026 - Ordnungsstrafen BOL 1BL.xlsx
CLICK_TT_FINE_SHEET_NAME=Sheet1
CLICK_TT_FINE_IGNORE_COLUMN=Ignore
CLICK_TT_FINE_SPIELLEITER=
CLICK_TT_FINE_DEFAULT_LIGA=
CLICK_TT_FINE_DEFAULT_GRUPPE=
CLICK_TT_FINE_NA_KOSTEN=100
```

## Usage

```bash
# Dry run first (recommended) — see what would be approved
npm run approve -- --dry-run

# Live run — actually approve matches
npm run approve

# With visible browser
npm run approve -- --headed

# Debug mode: visible browser, slower actions, halt on fatal errors
npm run approve -- --debug

# Filter by group
npm run approve -- --group "Bezirksoberliga Erwachsene"

# Combine flags
npm run approve -- --dry-run --headed --group "1. Bezirksliga 1 Erwachsene"
```

## Reports

After each run, a JSON report is saved to `reports/report-<timestamp>.json`.

If a fine workbook is configured, the same run also appends missing fine candidates into the configured Excel file. This includes skipped matches with failure reasons in `Bemerkung` and `Nicht angetreten` rows from the search results, even if click-TT already shows them as approved.

## Development

```bash
# Run validation (typecheck + lint)
./validate.ps1

# Run unit tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```
