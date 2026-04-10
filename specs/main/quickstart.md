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

## Usage

```bash
# Dry run first (recommended) — see what would be approved
npm run approve -- --dry-run

# Live run — actually approve matches
npm run approve

# With visible browser
npm run approve -- --headed

# Filter by group
npm run approve -- --group "Bezirksoberliga Erwachsene"

# Combine flags
npm run approve -- --dry-run --headed --group "1. Bezirksliga 1 Erwachsene"
```

## Reports

After each run, a JSON report is saved to `reports/report-<timestamp>.json`.

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
