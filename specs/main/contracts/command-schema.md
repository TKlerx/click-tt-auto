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
| `--report-dir <path>` | string | "./reports" | Directory to write JSON report file |

## Environment Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `CLICK_TT_USERNAME` | Yes | click-TT admin login email |
| `CLICK_TT_PASSWORD` | Yes | click-TT admin login password |
| `CLICK_TT_URL` | No | Base URL (default: `https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa`) |

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
Found 283 unapproved matches (10 pages)

Processing page 1/10...
  [APPROVED] TSV Eintracht Belle vs TTC Paderborn (10.10.2025)
  [APPROVED] TTS Detmold vs SV Heide Paderborn (10.10.2025)
  [SKIPPED]  TuRa Elsen III vs TTS Detmold (03.10.2025) — status: nicht angetreten
  [SKIPPED]  TTS Detmold vs TTC Paderborn (14.11.2025) — fewer than 6 players (guest: 5)
  ...

Processing page 2/10...
  ...

=============================
Summary:
  Total found:      283
  Approved:         245
  Skipped:           35
  Already approved:   3
  Errors:             0

Skipped matches:
  1. TuRa Elsen III vs TTS Detmold (03.10.2025) — status: nicht angetreten
  2. TTS Detmold vs TTC Paderborn (14.11.2025) — fewer than 6 players (guest: 5)
  3. SC Wewer vs TTS Detmold (24.11.2025) — error message: falsche Aufstellung
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
  "totalApproved": 245,
  "totalSkipped": 35,
  "totalAlreadyApproved": 3,
  "totalErrors": 0,
  "actions": [
    {
      "match": {
        "date": "10.10.2025 20:00",
        "homeTeam": "TSV Eintracht Belle",
        "guestTeam": "TTC Paderborn",
        "scoreHome": 9,
        "scoreGuest": 0,
        "status": "abgeschlossen",
        "group": "Bezirksoberliga Erwachsene"
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
        "date": "03.10.2025 20:00",
        "homeTeam": "TuRa Elsen III",
        "guestTeam": "TTS Detmold",
        "scoreHome": 9,
        "scoreGuest": 0,
        "status": "nicht angetreten",
        "group": "Bezirksoberliga Erwachsene"
      },
      "action": "skipped",
      "validation": {
        "isApprovable": false,
        "checks": [
          { "rule": "status", "passed": false, "reason": "status: nicht angetreten" }
        ]
      }
    }
  ]
}
```
