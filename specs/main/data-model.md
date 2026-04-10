# Data Model: Match Report Auto-Approval

## Entities

### MatchEntry (from list page)

Represents a match row on the Begegnungen list page.

| Field | Type | Description |
|-------|------|-------------|
| index | number | Position in current page (0-based) |
| date | string | Match date/time (e.g., "10.10.2025 20:00") |
| homeTeam | string | Home team name |
| guestTeam | string | Guest team name |
| scoreHome | number | Home team game score |
| scoreGuest | number | Guest team game score |
| status | string | "abgeschlossen", "nicht angetreten", "offen", etc. |
| points | string | Points result (e.g., "2:0", "0:2", "1:1") |
| isApproved | boolean | Whether checkmark is present (already approved) |
| erfassenUrl | string | URL of the "erfassen" link |
| group | string | Group name (e.g., "Bezirksoberliga Erwachsene") |

### MatchDetail (from detail page)

Represents the parsed content of a match detail/Kontrolle page.

| Field | Type | Description |
|-------|------|-------------|
| matchFormat | string | Detected format (e.g., "Sechser-Paarkreuz-System") |
| homeTeam | TeamLineup | Home team lineup data |
| guestTeam | TeamLineup | Guest team lineup data |
| hasErrorMessages | boolean | Whether text exists between buttons and Kontrolle |
| errorMessageText | string? | The error text content if found |
| bemerkungen | string | Content of Bemerkungen section |
| isAlreadyApproved | boolean | Whether "Spielbericht genehmigt" checkbox is already checked |

### TeamLineup

| Field | Type | Description |
|-------|------|-------------|
| teamName | string | Team name |
| hasMF | boolean | Whether MF row exists in lineup table |
| mfName | string? | MF player name if present |
| playerCount | number | Number of numbered players (expecting 6) |
| players | Player[] | List of numbered players |

### Player

| Field | Type | Description |
|-------|------|-------------|
| position | number | Position number (1-6) |
| name | string | Player name |
| rank | string | Player rank (e.g., "1.1", "2.3") |

### ValidationResult

| Field | Type | Description |
|-------|------|-------------|
| isApprovable | boolean | Whether all checks pass |
| checks | ValidationCheck[] | Individual check results |

### ValidationCheck

| Field | Type | Description |
|-------|------|-------------|
| rule | string | Rule identifier ("status", "error-messages", "mf-present", "player-count", "match-format") |
| passed | boolean | Whether this check passed |
| reason | string? | Human-readable failure reason if not passed |

### MatchAction

| Field | Type | Description |
|-------|------|-------------|
| match | MatchEntry | The match from the list |
| action | "approved" \| "skipped" \| "already-approved" \| "error" | What happened |
| validation | ValidationResult? | Validation result (for skipped matches) |
| error | string? | Error message if action is "error" |

### RunReport

| Field | Type | Description |
|-------|------|-------------|
| timestamp | string | ISO timestamp of run start |
| dryRun | boolean | Whether this was a dry run |
| group | string? | Group filter if specified |
| totalFound | number | Total unapproved matches found |
| totalApproved | number | Matches approved this run |
| totalSkipped | number | Matches skipped (failed validation) |
| totalAlreadyApproved | number | Matches already approved (checkmark) |
| totalErrors | number | Matches that errored during processing |
| actions | MatchAction[] | Detailed per-match results |

## State Transitions

### Match Processing Flow

```
[List Entry] → status check
  ├── status != "abgeschlossen" → SKIPPED (reason: status)
  ├── isApproved == true → ALREADY-APPROVED
  └── status == "abgeschlossen" → [Open Detail Page]
      ├── format != Sechser → SKIPPED (reason: unsupported format)
      ├── hasErrorMessages → SKIPPED (reason: error messages found)
      ├── !homeTeam.hasMF && !mfInBemerkungen(home) → SKIPPED (reason: MF missing home)
      ├── !guestTeam.hasMF && !mfInBemerkungen(guest) → SKIPPED (reason: MF missing guest)
      ├── homeTeam.playerCount < 6 → SKIPPED (reason: fewer than 6 players home)
      ├── guestTeam.playerCount < 6 → SKIPPED (reason: fewer than 6 players guest)
      └── ALL PASS → APPROVED (or DRY-RUN-WOULD-APPROVE)
```
