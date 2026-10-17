# click-tt-automation

Automation and planning tools for click-TT league administration.

**Match approvals and Excel fines:** see the [operator manual](docs/match-approval.md) for setup, group responsibility, season workbooks, dry/live runs, rechecking approved reports and manual review.

**Rasterzahl optimization:** see the [optimization manual](docs/raster-optimization.md) for the webapp workflow, CLI imports, solver runs, comparison and CSV exports.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Match-report approval CLI and shared click-TT automation |
| `src/raster/` | Raster ingest, rules, scoring, optimization, and reports |
| `src/spond/` | Spond event enrichment from nuScore PIN/code PDFs |
| `scripts/` | Raster pipeline utilities and repository maintenance |
| `webapp/` | Next.js planning and review application, worker, and database |
| `tests/` | Root CLI and raster tests plus committed fixtures |
| `specs/` | Feature specifications, plans, contracts, and task history |
| `docs/` | Focused operational and data-format documentation |

## Main commands

| Command | Purpose |
| --- | --- |
| `pnpm run approve --dry-run` | Safely inspect match-report approval work |
| `pnpm raster -- ...` | Run the Rasterzahl planner CLI |
| `pnpm spond:codes` | Parse local `codes/` PDFs without changing Spond |
| `pnpm spond:codes -- --apply` | Update matching Spond events |
| `pnpm run typecheck` | Type-check root TypeScript |
| `pnpm run lint` | Lint root code |
| `pnpm test` | Run root tests |
| `pwsh -File ./validate.ps1` | Validate root and webapp |

## Rasterzahl planner

Start with the [optimization operator manual](docs/raster-optimization.md). The examples below are a command reference; review input coverage, model warnings and solver status before accepting a proposal.

```powershell
pnpm raster:assignment
pnpm raster:public-context
pnpm raster:join-review reports/raster/public-team-context.csv reports/raster/admin-pdf-teams.csv data/upper-fixed.csv
pnpm raster -- ingest --from-clicktt --out reports/raster/model.json --current reports/raster/current.json --review reports/raster/review-input.csv
pnpm raster -- optimize --model reports/raster/model.json --start reports/raster/current.json --out reports/raster/proposal.json --report reports/raster/proposal-eval.json --csv reports/raster/optimized-assignment.csv --unmet reports/raster/unmet-wishes.csv
```

For explicit feasibility and optimality status, use the OR-Tools CP-SAT solver. It writes solver metadata and, when a solution is found, an assignment JSON. Only `OPTIMAL` proves optimality for the supplied model; `FEASIBLE` does not:

```powershell
pnpm raster:optimize-cpsat --model reports/raster/review-model.json --out reports/raster/review-proposal-cpsat.json --metadata reports/raster/review-proposal-cpsat-metadata.json --time-limit 300 --workers 8
pnpm raster -- score --model reports/raster/review-model.json --assignment reports/raster/review-proposal-cpsat.json --report reports/raster/review-proposal-cpsat-eval.json --unmet reports/raster/review-unmet-wishes-cpsat.csv
pnpm raster:spielwoche-overages reports/raster/review-model.json reports/raster/review-proposal-cpsat.json reports/raster/spielwoche-overages-cpsat.csv
pnpm raster:optimized-review reports/raster/review-model.json reports/raster/review-proposal-cpsat.json reports/raster/optimized-raster-review-cpsat.csv
```

To add every team from clubs that appear in your groups, pass the public click-TT league index. The scraper reads the mytischtennis `gruppe/<id>` links from that page and rewrites them to public click-TT `groupPage?...&group=<id>` URLs:

```powershell
pnpm raster -- ingest --from-clicktt --public-league "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/leaguePage?championship=Ostwestfalen/Lippe%2026/27" --out reports/raster/model.json --current reports/raster/current.json --review reports/raster/review-input.csv
```

To keep already assigned upper-district Rasterzahlen fixed, pass a CSV/JSON table with `group,rasterzahl,team` columns:

```powershell
pnpm raster -- ingest --from-clicktt --fixed data/upper-district-raster.csv --out reports/raster/model.json --current reports/raster/current.json
pnpm raster -- optimize --model reports/raster/model.json --start reports/raster/current.json --csv reports/raster/optimized-assignment.csv
```

See `docs/raster-fixed-assignments.md` for the fixed-assignment CSV/JSON schema, including optional `league` matching.

Hall capacity is optional. Missing capacity means unlimited capacity. To constrain capacity, pass a CSV with `club,hall,weekday,capacity`; leave `hall` or `weekday` blank to make the row broader:

```csv
club,hall,weekday,capacity
TTV Höxter,2,friday,1
SC GW Paderborn,,friday,2
```

```powershell
pnpm raster -- ingest --from-clicktt --capacity data/hall-capacity.csv --out reports/raster/model.json --current reports/raster/current.json
```

The click-TT path clicks through `SpielbetriebOrganisation`, reads each group table, downloads the group-level `Terminmeldungen (pdf)` file, verifies that the PDF text matches the clicked group page, then computes the remaining assignable Rasterzahlen. Do not replay collected `nuLigaAdminTTDE.woa/wo/...` URLs directly; they contain stateful click counters and can return the wrong group/PDF. The older PDF-only flow still works:

```powershell
pnpm run raster -- ingest --wishes data/Terminmeldung_gesamt_bol.pdf --groups data/Gruppen-und-Raster-2026.pdf --out reports/raster/model.json
pnpm run raster -- score --model reports/raster/model.json --assignment reports/raster/current.json --report reports/raster/score.json
pnpm run raster -- optimize --model reports/raster/model.json --start reports/raster/current.json --out reports/raster/proposal.json
```

Review `reports/raster/model.json` before scoring. PDF extraction is best-effort and flags review fields instead of silently trusting uncertain rows. Tune penalties with `specs/002-rasterzahl-wish-optimizer/weights.example.json`.

The webapp review step can import the current click-TT Rasterzahlen as a versioned manual baseline. Imports use the same authenticated live navigation, require the three `CLICK_TT_*` variables below, and never replay captured admin URLs. Failed refreshes keep the previous active baseline. A reviewed baseline may be selected when starting a run, but it is comparison metadata only and never becomes a solver constraint. The production app image installs Debian Chromium and sets `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.

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
pnpm install
pnpm exec playwright install chromium
```

Create or update `.env` with your credentials:

```bash
CLICK_TT_USERNAME=your-click-tt-username
CLICK_TT_PASSWORD=your-click-tt-password
CLICK_TT_URL=https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa
CLICK_TT_FINE_WORKBOOK_PATH=data/2026-2027 - Ordnungsstrafen BOL 1BL.xlsx
CLICK_TT_FINE_SHEET_NAME=Sheet1
CLICK_TT_FINE_IGNORE_COLUMN=Ignore
# Optional: override the bundled WO 7/26 district catalogue
# CLICK_TT_FINE_CATALOGUE_PATH=data/fine-catalogue.wttv-2026.json
```

Optional fine-workbook settings:

Set your responsibility separately from your click-TT account permissions in `.env`:

```bash
CLICK_TT_GROUPS=Bezirksoberliga Erwachsene,1. Bezirksliga 1 Erwachsene,1. Bezirksliga 2 Erwachsene
```

These are exact click-TT group labels (case and whitespace are normalized). This scope applies to both approvals and fines, including `--process-all`. Other groups are filtered from each results page before opening detail pages or collecting status fines. `--group` can narrow this scope but cannot expand it. Unset/empty means all accessible groups. The example above covers Erwachsenen Bezirksoberliga and both 1. Bezirksliga groups; Damen, Jugend and lower leagues are excluded. Reports print the configured scope; the scanned count includes all rows seen on results pages.

- `CLICK_TT_FINE_WORKBOOK_PATH`: when set, skipped fine candidates and `nicht angetreten` rows are synced into the workbook
- `CLICK_TT_FINE_SHEET_NAME`: target worksheet; defaults to the first sheet
- `CLICK_TT_FINE_IGNORE_COLUMN`: column used to suppress known false positives on future runs
- `CLICK_TT_FINE_SPIELLEITER`: default value for the `Spielleiter` column on appended rows
- `CLICK_TT_FINE_DEFAULT_LIGA` / `CLICK_TT_FINE_DEFAULT_GRUPPE`: fallback values when the list page does not expose a clean group name
- `CLICK_TT_FINE_CATALOGUE_PATH`: optional season and league-specific fine catalogue JSON; defaults to `data/fine-catalogue.wttv-2026.json`
- `CLICK_TT_FINE_NA_KOSTEN`: fallback fine amount used for appended `Nicht angetreten` rows when no catalogue entry matches

Fine catalogue example:

```json
{
  "seasons": {
    "2025-2026": {
      "events": {
        "mf-fehlt": {
          "grund": "Fehlende Angabe des Mannschaftsführers",
          "rechtsgrundlage": "A 20.1.9 a",
          "kosten": 10
        },
        "error-message": {
          "patterns": [
            {
              "match": "Falsche Einzelaufstellung",
              "grund": "Falsche Einzel- oder Doppelaufstellung",
              "rechtsgrundlage": "A 20.1.5 b",
              "kosten": 10
            }
          ]
        }
      },
      "leagues": {
        "Bezirksoberliga": {
          "lowestTeams": [],
          "events": {
            "nicht-angetreten": {
              "grund": "Nichtantreten einer Mannschaft",
              "rechtsgrundlage": "A 20.1.1",
              "kosten": 100,
              "lowestTeam": {
                "kosten": 50
              }
            }
          }
        }
      }
    }
  }
}
```

The season is derived from the match date (`July-June`, WO A 9, for example `2026-2027`). League names are matched case-insensitively after whitespace normalization. Use `*` as a wildcard league or season. Supported event keys are `nicht-angetreten`, `mf-fehlt`, `unvollstaendige-einzelaufstellung`, `fehlerhafte-berichtseingabe`, `mf-kommentar-pruefen` (review only), and `error-message`.

League-specific reductions are represented by putting a different event entry below that league. Lowest-team reductions are represented by adding exact team names to `lowestTeams` at season or league level, then setting a `lowestTeam` override on the affected event. The tool does not infer lowest-team status from names like `III`, because it cannot know from one match row whether that is truly the lowest registered team.

For `error-message`, optional `patterns` are checked against the click-TT message text in order. The first pattern whose `match` text appears in the message can override `Grund`, `Rechtsgrundlage`, and `Kosten`. Fines that do not appear on match reports, such as transfer applications or tournament approvals, should stay out of automatic matching and be handled manually.

### Fines for 2026/27 (WO 7/26)

Source: [WTTV Wettspielordnung, July 2026](https://wttv.de/wp-content/uploads/WO2026-07.pdf), A 20.1–20.6, pages 19–20; season dates: A 9, page 11.
The bundled `data/fine-catalogue.wttv-2026.json` applies only to 2026/27 district leagues: Bezirksoberliga, Bezirksliga/1. Bezirksliga/2. Bezirksliga and Bezirksklasse/1.–3. Bezirksklasse. Other league names need an explicit catalogue entry. Verband rates are listed below for reference and require a custom catalogue. The historical example catalogue is not the default.

| Check / words in click-TT evidence | Rule | Bezirk | Verband | Handling |
| --- | --- | ---: | ---: | --- |
| Status `nicht angetreten` | A 20.1.1 | €100 | €200* | Status candidate, including already marked rows |
| Zurückziehung | A 20.1.2 | €100 | €200* | Manual; withdrawal is not inferred from a match result |
| Spielabbruch / Verschulden | A 20.1.3 | €100 | €200 | Manual; establish responsibility |
| `Vorsätzliche Falscheintragung` | A 20.1.4 | €100 | €200 | Explicit error text only; intent requires review under A 20.6 |
| `fehlende` / `keine Spielberechtigung` or `Einsatzberechtigung` | A 20.1.5 a | €10/player | €20/player | Text candidate; amount per player shown as text until the count is verified |
| `Falsche Einzelaufstellung` / `Falsche Doppelaufstellung` | A 20.1.5 b | €10 | €20 | Text candidate |
| Fewer than six numbered players in the supported Sechser-Paarkreuz-System | A 20.1.6 | €10/missing player | €20/missing player | Multiply by missing count; lowest registered team exempt |
| `falsche Spielpaarung` | A 20.1.7 | €10 | €20 | Text candidate |
| `ohne Umrandungen` / `ohne Zählgeräte` | A 20.1.8 | €10 | €20 | Explicit text only |
| Missing MF / `Fehlende Angabe des Mannschaftsführers` | A 20.1.9 a | €10 | €20 | Existing MF check or text candidate |
| `Fehlende Unterschrift` | A 20.1.9 b | €10 | €20 | Paper report; explicit text only |
| `fehlende Angaben zu` Spielbeginn, Spielende, Trikots, Zählgeräten, Umrandungen | A 20.1.9 c | €10 | €20 | Explicit text only |
| `Verspätetes Antreten` | A 20.1.10 | €10 | €20 | Explicit text only |
| `fehlende` / `verspätete Ergebnismeldung` | A 20.1.11 | €10 | €20 | Explicit text; verify first-entry timestamp and applicable deadline |
| `fehlende` / `verspätete Eintragung des Spielberichts` | A 20.1.12 | €10 | €20 | Explicit text; verify applicable deadline |
| `Fehlerhafte Eintragung` or an incomplete lineup-entry screen | A 20.1.13 | €10 | €20 | Explicit text, or a matching fixture heading with `playerFormationForm`, step `1. Mannschaftsaufstellung`, Weiter/Abbrechen controls and no approval checkbox. Rechecked before classification; only completed, unapproved fixtures past the 24-hour report-entry deadline (WO I 5.13) generate this candidate. The home team is liable; no approval is saved. Generic parser/network failures do not generate this fine. |
| `nicht einheitliche Trikots` / `nicht einheitlichen Trikots` | A 20.1.14 | €10 | €20 | Explicit text only |
| Nichteinhaltung von Terminen, e.g. Vereins-/Termin-/Mannschaftsmeldung | A 20.1.15 | €10 | €20 | Manual; not available from the match validation |
| Venue not ready 30 minutes before start / at scheduled start | A 20.1.16 a/b | €10/€20 | €20/€50 | Manual; exact timing required |
| Unequal colour, make or condition of tables, nets or balls | A 20.1.17 | €10 | €20 | Manual |
| `Fehlender Spiel-PIN` / `Verweigerung der Mitwirkung` | A 20.1.18 | €10 | €20 | Explicit text only; bare `Spiel-PIN` does not prove an offence |
| Paper report where nuScore is mandatory | A 20.1.18 | €10 | €20 | Manual; verify mandate and guest responsibility |
| Playing despite a ban or suspension/termination of play | A 20.1.19 | €100/team | €200/team | Manual |
| Withdrawal of a registration/transfer application in the specified cases | A 20.1.20 | — | €100 | Manual |
| Tournament without approval / despite prohibition | A 20.1.21 | — | €200 | Manual |
| Missing/incomplete tournament results or missing tournament closure | A 20.1.22 | — | €20 | Manual |

*For Verband **league matches**, A 20.1.1/2 exceptions: NRW-Liga Erwachsene €300, Verbandsliga Erwachsene €250, Verbandsliga Jugend €100 unless the lowest team; lowest team in Damen, Senioren or Jugend €50. The €50 exception does **not** reduce a district adult team's no-show fine. District reductions below the listed rates require the relevant Bezirkstag/Bezirksjugendtag decision (A 20.2); Bezirksoberliga Erwachsene cannot be reduced. Repeated offences may be increased to at most twice the table amount (A 20.4); the tool does not infer recurrence.

The bundled season's `leagueNames` list restricts the shared district rates to those exact league names; league-specific `leagues` entries can override them. For A 20.1.6, populate exact `lowestTeams` names from the Vereinsmeldung in a custom catalogue. `perMissingPlayer: true` multiplies `kosten` by the actual missing count; the `lowestTeam` override of zero records an exempt review candidate. Without that evidence, `Bemerkung` explicitly asks to verify lowest-team status. A failed player count in an unsupported match format does not generate this fine.

Excel destination remains `CLICK_TT_FINE_WORKBOOK_PATH`, with `CLICK_TT_FINE_SHEET_NAME` or the first worksheet. Each candidate writes the regulation's wording to `Grund`, the A 20 reference to `Rechtsgrundlage`, the amount to `Kosten`, and the identified club/team to `Strafe gegen`. Original error text goes to `Click-TT Text`; validation evidence and exemption checks go to `Bemerkung`. Fixture metadata, `Spielleiter` and `Eingetragen am` keep their existing columns. Unknown text keeps the original message with blank rule/amount and `catalogueMatched: false`. The first matching text pattern is used; combined notices require review for additional offences and liable teams.

These are review candidates, not issued penalties. Missing timestamps, signatures, venue conditions, intent and local decisions are not inferred from keywords. Existing rows remain append-only; changing a catalogue does not rewrite past entries. Duplicate/Ignore identity is home + guest + date + liable team (`Strafe gegen`) + reason. Both teams can receive separate rows for the same offence; ignoring one team's row does not suppress the other team's fine. Historical rows with an empty `Strafe gegen` need that field filled to match team-specific candidates. Start with `pnpm approve --dry-run` to inspect the resolved amounts before updating the configured workbook.

## Recommended Run Order

For the complete operator workflows, use the separate [match approval manual](docs/match-approval.md) and [optimization manual](docs/raster-optimization.md).

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
- `--recheck`: audit past completed reports, including approved reports, and collect fines without changing click-TT approvals; creates a missing output workbook
- `--fine-workbook <path>`: override the Excel output path for this run (existing files are appended to)
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
3. Both teams have an `MF` entry, either in the lineup table or identified in `Bemerkungen`. Comments accept MF/M.F., Mannschaftsführer (including Manschaftsführer and ASCII umlauts), Spielführer, Kapitän and Captain. Captains can be identified by A/B positions, Heim/Gast labels, named teams (Roman/Arabic team numbers match), or full player names uniquely matching each lineup, including surname-first order. Unclear or contradictory nonempty comments require manual review: the report stays unapproved and Excel receives an unpriced review row with the comment evidence, without an automatic MF fine or assigned liability. Empty comments with no MF entries still generate missing-MF fine candidates.
4. Both teams have exactly six numbered player rows (`1` through `6`).
5. The approval checkbox is not already checked.

When a rule fails, the tool clicks `Abbrechen`, records the reason, and continues with the next match.

This makes the tool suitable for semi-automated league administration: it handles the routine approvals quickly, but leaves unusual, risky, or sanction-relevant matches for manual review.

If a fine workbook is configured, the tool also:

- appends missing fine candidates for skipped matches
- appends missing `Nicht angetreten` rows found on the search results page, even if the row is already marked approved in click-TT
- adds an `Ignore` column when needed so false positives can be suppressed on later runs
- adds a `Click-TT Text` column when needed and writes the original red click-TT message there for human review
- writes `Datum` as a real Excel date value
- adds an `Eingetragen am` column and fills it as a real Excel date/time value for newly appended rows
- writes the auto-approval failure reason into `Bemerkung` for appended skipped-match fines

With `--dry-run`, these workbook candidates are still calculated and reported, but the Excel file is not modified. The stdout summary and JSON report include the catalogue resolution for each fine candidate: event key, season, league, pattern match, lowest-team override, final rule, and final amount.

## Development

```bash
npm run typecheck
npm run lint
npm test
pwsh -File ./validate.ps1
```
