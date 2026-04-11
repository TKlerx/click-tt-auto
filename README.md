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
```

## Usage

```bash
npm run approve
npm run approve -- --dry-run
npm run approve -- --headed
npm run approve -- --debug
npm run approve -- --dry-run --headed --slow-mo 1500
npm run approve -- --group "Bezirksoberliga Erwachsene"
```

`--debug` is a convenience mode for investigation runs:

- forces a visible browser window
- slows Playwright actions down so you can follow the UI
- keeps the browser open on fatal errors until you press Enter in the terminal

## Validation Rules

The tool approves only when all of these pass:

1. Match format is `Sechser-Paarkreuz-System`.
2. No unexpected text or warning elements appear between the top button row and the `Kontrolle` fieldset.
3. Both teams have an `MF` entry, either in the lineup table or mentioned in `Bemerkungen`.
4. Both teams have exactly six numbered player rows (`1` through `6`).
5. The approval checkbox is not already checked.

When a rule fails, the tool clicks `Abbrechen`, records the reason, and continues with the next match.

## Development

```bash
npm run typecheck
npm run lint
npm test
pwsh -File ./validate.ps1
```
