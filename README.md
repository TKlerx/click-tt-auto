# click-tt-automation

## Rasterzahl planner

```powershell
pnpm raster:assignment
pnpm raster:public-context
pnpm raster:join-review reports/raster/public-team-context.csv reports/raster/admin-pdf-teams.csv data/upper-fixed.csv
pnpm raster -- ingest --from-clicktt --out reports/raster/model.json --current reports/raster/current.json --review reports/raster/review-input.csv
pnpm raster -- optimize --model reports/raster/model.json --start reports/raster/current.json --out reports/raster/proposal.json --report reports/raster/proposal-eval.json --csv reports/raster/optimized-assignment.csv --unmet reports/raster/unmet-wishes.csv
```

For a proven-optimal solution, use the OR-Tools CP-SAT solver. It writes an assignment JSON plus solver metadata with `OPTIMAL`, `FEASIBLE`, or infeasible status:

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
CLICK_TT_FINE_WORKBOOK_PATH=data/2025-2026 - Ordnungsstrafen BOL 1BL.xlsx
CLICK_TT_FINE_SHEET_NAME=Sheet1
CLICK_TT_FINE_IGNORE_COLUMN=Ignore
CLICK_TT_FINE_CATALOGUE_PATH=data/fine-catalogue.json
```

Optional fine-workbook settings:

- `CLICK_TT_FINE_WORKBOOK_PATH`: when set, skipped fine candidates and `nicht angetreten` rows are synced into the workbook
- `CLICK_TT_FINE_SHEET_NAME`: target worksheet; defaults to the first sheet
- `CLICK_TT_FINE_IGNORE_COLUMN`: column used to suppress known false positives on future runs
- `CLICK_TT_FINE_SPIELLEITER`: default value for the `Spielleiter` column on appended rows
- `CLICK_TT_FINE_DEFAULT_LIGA` / `CLICK_TT_FINE_DEFAULT_GRUPPE`: fallback values when the list page does not expose a clean group name
- `CLICK_TT_FINE_CATALOGUE_PATH`: optional season and league-specific fine catalogue JSON
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

The season is derived from the match date (`August-July`, for example `2025-2026`). League names are matched case-insensitively after whitespace normalization. Use `*` as a wildcard league or season. Supported event keys are `nicht-angetreten`, `mf-fehlt`, `unvollstaendige-einzelaufstellung`, and `error-message`.

League-specific reductions are represented by putting a different event entry below that league. Lowest-team reductions are represented by adding exact team names to `lowestTeams` at season or league level, then setting a `lowestTeam` override on the affected event. The tool does not infer lowest-team status from names like `III`, because it cannot know from one match row whether that is truly the lowest registered team.

For `error-message`, optional `patterns` are checked against the click-TT message text in order. The first pattern whose `match` text appears in the message can override `Grund`, `Rechtsgrundlage`, and `Kosten`. Fines that do not appear on match reports, such as transfer applications or tournament approvals, should stay out of automatic matching and be handled manually.

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
