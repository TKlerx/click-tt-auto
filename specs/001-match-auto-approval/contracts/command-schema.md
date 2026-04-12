# CLI Command Schema

## Command

```
npx tsx src/index.ts [options]
```

Or via npm script:
```
npm run approve [-- options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | boolean | false | Evaluate all rules without approving. No changes made to click-TT. |
| `--group <name>` | string | "Alle meine Gruppen" | Filter by specific group (e.g., "Bezirksoberliga Erwachsene") |
| `--headed` | boolean | false | Run with visible browser window (default: headless) |
| `--debug` | boolean | false | Convenience mode: visible browser, slower actions, halt on fatal errors |
| `--no-halt-on-error` | boolean | false | Override debug's default halt behavior and continue after fatal page errors |
| `--report-dir <path>` | string | "./reports" | Directory to write JSON report file |

## Environment Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `CLICK_TT_USERNAME` | Yes | click-TT admin login email |
| `CLICK_TT_PASSWORD` | Yes | click-TT admin login password |
| `CLICK_TT_URL` | No | Base URL (default: `https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa`) |
| `CLICK_TT_FINE_WORKBOOK_PATH` | No | Existing Excel workbook to append fine candidates to |
| `CLICK_TT_FINE_SHEET_NAME` | No | Target worksheet (defaults to first sheet) |
| `CLICK_TT_FINE_IGNORE_COLUMN` | No | Column name used to suppress false positives |
| `CLICK_TT_FINE_SPIELLEITER` | No | Default workbook value for `Spielleiter` |
| `CLICK_TT_FINE_DEFAULT_LIGA` | No | Fallback `Liga` when page metadata is incomplete |
| `CLICK_TT_FINE_DEFAULT_GRUPPE` | No | Fallback `Gruppe` when page metadata is incomplete |
| `CLICK_TT_FINE_NA_KOSTEN` | No | Fine amount for `Nicht angetreten` rows (default: `100`) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — run completed (matches may have been skipped but tool ran correctly) |
| 1 | Error — login failed, navigation error, or unrecoverable failure |

## Stdout Output (human-readable)

```
click-TT Match Auto-Approval
=============================
Mode: LIVE (or DRY RUN)
Group: Alle meine Gruppen
Date: 2026-04-10T20:30:00Z

Logging in... OK
Navigating to Begegnungen... OK
Filtering unapproved matches... OK
Found 283 result rows (10 pages)

Processing page 1/10...
  [APPROVED] TSV Eintracht Belle vs TTC Paderborn (10.10.2025)
  [APPROVED] TTS Detmold vs SV Heide Paderborn (10.10.2025)
  [SKIPPED]  TTS Detmold vs TTC Paderborn (14.11.2025) — fewer than 6 players (guest: 5)
  ...

Processing page 2/10...
  ...

=============================
Summary:
  Total found:      283
  Scanned:          283
  Actionable:       248
  Ignored:          35
  Approved:         245
  Skipped:            2
  Already approved:   3
  Errors:             0

Fine Workbook:
  Candidates:        14
  Appended:           6
  Existing:           7
  Ignored:            1

Skipped matches:
  1. TTS Detmold vs TTC Paderborn (14.11.2025) — guest has 5 numbered players
  2. SC Wewer vs TTS Detmold (24.11.2025) — error message found: falsche Aufstellung
  ...

Report saved to: reports/report-2026-04-10T203000Z.json
```

## JSON Report Schema

```json
{
  "timestamp": "2026-04-10T20:30:00Z",
  "dryRun": false,
  "group": null,
  "totalFound": 283,
  "totalScanned": 283,
  "totalActionable": 248,
  "totalIgnored": 35,
  "totalApproved": 245,
  "totalSkipped": 2,
  "totalAlreadyApproved": 3,
  "totalErrors": 0,
  "fineSync": {
    "enabled": true,
    "workbookPath": "data/2025-2026 - Ordnungsstrafen BOL 1BL.xlsx",
    "sheetName": "Sheet1",
    "totalCandidates": 14,
    "appended": 6,
    "existing": 7,
    "ignored": 1
  },
  "actions": [
    {
      "match": {
        "date": "10.10.2025 20:00",
        "homeTeam": "TSV Eintracht Belle",
        "guestTeam": "TTC Paderborn",
        "scoreHome": 9,
        "scoreGuest": 0,
        "status": "abgeschlossen",
        "group": "Bezirksoberliga Erwachsene",
        "liga": "Bezirksoberliga",
        "gruppe": ""
      },
      "action": "approved",
      "validation": {
        "isApprovable": true,
        "checks": [
          { "rule": "status", "passed": true },
          { "rule": "match-format", "passed": true },
          { "rule": "error-messages", "passed": true },
          { "rule": "mf-present", "passed": true },
          { "rule": "player-count", "passed": true }
        ]
      }
    },
    {
      "match": {
        "date": "14.11.2025 20:00",
        "homeTeam": "TTS Detmold",
        "guestTeam": "TTC Paderborn",
        "scoreHome": 8,
        "scoreGuest": 8,
        "status": "abgeschlossen",
        "group": "Bezirksoberliga Erwachsene",
        "liga": "Bezirksoberliga",
        "gruppe": ""
      },
      "action": "skipped",
      "validation": {
        "isApprovable": false,
        "checks": [
          { "rule": "status", "passed": true },
          { "rule": "match-format", "passed": true },
          { "rule": "error-messages", "passed": true },
          { "rule": "mf-present", "passed": true },
          { "rule": "player-count", "passed": false, "reason": "guest has 5 numbered players" }
        ]
      }
    }
  ]
}
```
