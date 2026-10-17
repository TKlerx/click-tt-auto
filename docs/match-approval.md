# Match approval and Excel fine tracking

Operator guide for checking click-TT match reports, saving valid approvals and recording findings in a season workbook. Raster planning and optimization use separate commands documented in the [README](../README.md#rasterzahl-planner).

## 1. Set up your computer

Install Node.js 22 or later and the pnpm version declared in `package.json`. Open a terminal in the repository root, then run:

```powershell
pnpm install
pnpm exec playwright install chromium
```

Copy `.env.example` to `.env` if you do not already have a configuration. Keep your existing `.env` when updating the software. Credentials and Excel workbooks are local files and are not included in a fresh Git checkout.

## 2. Configure your responsibility and season workbook

Example `.env` for the 2026/27 Bezirksoberliga and both 1. Bezirksliga Erwachsene groups:

```dotenv
CLICK_TT_USERNAME=your-click-tt-username
CLICK_TT_PASSWORD=your-click-tt-password
CLICK_TT_GROUPS=Bezirksoberliga Erwachsene,1. Bezirksliga 1 Erwachsene,1. Bezirksliga 2 Erwachsene
CLICK_TT_FINE_WORKBOOK_PATH=data/2026-2027 - Ordnungsstrafen BOL 1BL.xlsx
CLICK_TT_FINE_SHEET_NAME=Sheet1
CLICK_TT_FINE_IGNORE_COLUMN=Ignore
CLICK_TT_FINE_SPIELLEITER=Your name
```

Use your own account and exact click-TT group labels. Case and repeated whitespace are normalized; league names are not prefix matches. Include each numbered group separately. These examples exclude Damen, Jugend and lower leagues.

**Set `CLICK_TT_GROUPS` before a live run.** Empty or absent means all groups accessible to the account. The filter applies to approvals, fine collection and `--process-all`. A `--group` argument can narrow the configured scope but cannot expand it. The startup line `Responsible groups:` shows the effective responsibility.

For normal approval runs, the workbook must already exist at the configured path. Recheck mode can create a missing workbook. Close it in Excel before running the tool. Without `CLICK_TT_FINE_WORKBOOK_PATH`, approvals still work but Excel export is disabled unless you supply `--fine-workbook`.

The CLI has no season-selection option. Verify the season shown in click-TT during a headed dry run and the match dates in the saved JSON report. Naming the workbook `2026-2027` does not select that season in click-TT.

### Create a workbook for a new season

1. In Excel, make a copy of a previous season's workbook with a new filename.
2. Clear the previous season's records below the header, retaining the header and formatting. Keep the old workbook intact.
3. Save as `.xlsx` and set `CLICK_TT_FINE_WORKBOOK_PATH` to the new file.
4. Check the sheet name and run a dry run before exporting.

For a workbook created from scratch, paste this tab-separated header into cell A1 and save it as `.xlsx`:

```text
Liga	Gruppe	Serie	Datum	Spielnummer	Heim	Gast	Strafe gegen	Grund	Rechtsgrundlage	Bemerkung	Kosten	Spielleiter	Ignore	Eingetragen am	Click-TT Text
```

Column names must match exactly. The tool can add the metadata columns `Ignore`, `Eingetragen am` and `Click-TT Text`. Recheck mode creates a missing workbook with all 16 columns, a frozen header and filters; existing files retain their layout.

The bundled fine catalogue is `data/fine-catalogue.wttv-2026.json`, scoped to 2026/27 district leagues. For local overrides, copy that file and set `CLICK_TT_FINE_CATALOGUE_PATH` to your copy. Review the catalogue when changing seasons. The match date determines the catalogue season, from July through June.

## 3. Check first, then approve

### Dry run

```powershell
pnpm run approve --dry-run --plain-progress
```

To watch the browser:

```powershell
pnpm run approve --dry-run --headed --plain-progress
```

These commands log in, read reports and calculate proposed Excel additions. They do not save approvals or modify the workbook. In a dry-run JSON report, an action named `approved` means **would approve**; the report's `dryRun` field is `true`. The summary's `Approved` count also represents proposed approvals in this mode.

Use the commands as shown. The CLI also accepts a leading `--` separator forwarded by a package runner.

Review the responsible groups, match dates, proposed approvals, skipped reasons and `Fine Workbook` summary. `Scanned` can include rows from other accessible groups because the tool reads shared results pages; it filters them before opening reports or collecting fines.

### Live run

Save a dated backup of the workbook and close Excel. Then run:

```powershell
pnpm run approve --plain-progress
```

The startup mode must not say `DRY RUN`. A live run saves approvals for reports that pass every check, then appends missing Excel findings. There is no additional confirmation prompt.

Read the final summary and saved JSON report. Check both the match errors and the Excel export result; a successful process exit alone does not confirm Excel export succeeded.

### Recheck past reports, including approved matches

Use `--recheck` to audit completed reports and `Nicht angetreten` fixtures whose scheduled start is before the run started. Both approved and unapproved reports are included. Future fixtures and dates the tool cannot interpret are excluded. This mode always returns through Abbrechen; it never changes approval checkboxes or saves reports in click-TT, even without `--dry-run`.

Preview findings for every group in `CLICK_TT_GROUPS`, using a separate output file:

```powershell
pnpm run approve --recheck --dry-run --fine-workbook "data/2026-2027 - Recheck.xlsx"
```

Create that workbook and write the findings:

```powershell
pnpm run approve --recheck --fine-workbook "data/2026-2027 - Recheck.xlsx"
```

To recheck just one configured group:

```powershell
pnpm run approve --recheck --group "1. Bezirksliga 2 Erwachsene" --fine-workbook "data/2026-2027 - Recheck.xlsx"
```

For several groups, list their exact labels in `CLICK_TT_GROUPS`. `--group` narrows that list; it cannot expand it. The active click-TT season still determines which fixtures are available.

`--fine-workbook` overrides the configured path for this run. Without it, recheck uses the configured workbook and appends only missing findings. A new file starts its own duplicate/Ignore history; decisions in a different workbook are not copied. Existing output files are appended to, never cleared. A dry run does not create or modify the file. Clean reports have action `checked`; issues have action `skipped`; `Approved` remains zero. Skipped in this mode does not revoke an existing approval. All existing fine checks and comment handling apply.

## 4. What can be approved automatically?

The normal flow opens completed (`abgeschlossen`), unapproved reports within the configured groups. It approves only reports that have:

- The supported `Sechser-Paarkreuz-System` format and six numbered players per team.
- No unexpected warnings or error messages in the report's control area.
- A Mannschaftsführer identified for both teams, either in the lineup table or in the actual `Bemerkungen`.
- An approval checkbox that is not already checked.

A match with status `offen` is not a completed report awaiting approval. The tool does not approve unplayed matches or enter missing results for clubs. Already approved normal reports are skipped; `Nicht angetreten` status rows are still considered for Excel tracking.

### Mannschaftsführer in comments

Recognized examples include:

```text
MF A3 / B4
Manschaftsführer A3 und B3
Mannschaftsführer Tus Bad Wünnenberg 2: Markus Franke TTV Höxter 2: Tarik Özdemir
MF: Heim: Markus Franke / Gast: Tarik Özdemir
MF: Markus Franke / Tarik Özdemir
```

The last form requires full names that uniquely match players in the respective lineups. Surname-first names are supported. Other supported labels include `M.F.`, `Spielführer`, `Kapitän` and `Captain`. Roman and Arabic team numbers are equivalent, such as `II` and `2`.

| Evidence | Result |
| --- | --- |
| Both captains identified | MF check passes; all other approval checks still apply |
| No lineup MF and empty comments, including the UI placeholder `keine Bemerkungen` | Missing-MF candidate for each affected team |
| Nonempty comments cannot be confidently interpreted, or contain conflicting/negative information | Keep report unapproved; export `MF-Angabe in Bemerkungen prüfen` with blank amount and liability |

Equipment and approval checkboxes following `Bemerkungen` are not part of the comment text.

### Incomplete reports such as the Belle case

A report that still opens on the specific `1. Mannschaftsaufstellung` entry screen can generate a faulty-entry candidate against the home team. Detection requires the matching fixture heading, lineup form, Weiter/Abbrechen controls and no approval checkbox. The tool retries before classifying it.

Automatic classification applies to completed fixtures after the 24-hour report-entry deadline; normal approval runs require an unapproved fixture, while recheck also includes approved fixtures. The 2026/27 district catalogue maps this to `A 20.1.13`, €10. A timeout, unrelated page or generic missing-field error does not become a fine.

## 5. Review the Excel findings

| Column | Meaning |
| --- | --- |
| Liga, Gruppe, Serie, Datum, Heim, Gast | Fixture information |
| Strafe gegen | Identified liable team; blank for unresolved review findings |
| Grund | Standardized offence or review reason |
| Rechtsgrundlage | Applicable rule, when identified |
| Bemerkung | Validation evidence, comments or remaining checks |
| Kosten | Fine amount when resolved; blank means unresolved, not €0 |
| Click-TT Text | Original click-TT error text, when present |
| Spielleiter, Eingetragen am | Configured operator and entry timestamp |
| Ignore | Mark `x` to suppress the same candidate on later runs |

Excel rows are review candidates. The automation does not issue a formal Ordnungsbescheid or send a notification to a club.

Review exemptions and local rules before using the ledger for penalties. In particular, incomplete-team charges are per missing player, and the lowest registered team is exempt. The tool cannot infer lowest-team status from `II` or `III`; configure exact `lowestTeams` names in a custom catalogue or verify manually. The [2026/27 fine table](../README.md#fines-for-202627-wo-726) lists supported rules and cases requiring additional evidence.

Duplicate and Ignore matching uses **date + Heim + Gast + Strafe gegen + Grund**. Both teams can receive separate rows for the same offence. A rerun does not append the same team-specific finding twice. Keep those identity fields intact when using `Ignore`; adding `x` does not approve the report or change its underlying issue. Record the reason for ignoring a finding in `Bemerkung`.

Existing rows are not automatically revised or removed when comments, rules or detection improve. Correct confirmed false positives in the workbook and rerun a dry check to verify the current result. Review rows with blank amounts must be resolved manually; they are not included as automatic monetary penalties.

## 6. Reports and troubleshooting

Each completed run prints its JSON report path, normally `reports/report-<timestamp>.json`. Reports contain mode, responsibility, match actions, failed checks and Excel sync details. Unexpected detail-page failures can also save HTML snapshots. Use the JSON report when the console truncates the findings list.

| Situation | Action |
| --- | --- |
| Wrong groups in `Responsible groups:` | Stop before a live run and correct `CLICK_TT_GROUPS` |
| Wrong season or workbook | Correct the click-TT season/workbook setup and repeat the dry run |
| Missing workbook or worksheet | Create/provide the `.xlsx` or correct its path/sheet name |
| Excel locked or export failed | Close Excel, retain the JSON report and inspect `fineSync.error`; approvals already saved in click-TT are not rolled back |
| Unknown format, page shape or parser error | Inspect the saved reason/snapshot; do not treat the parser error itself as an offence |
| Captain information unclear | Inspect the actual comments and lineup, resolve the review finding, then approve manually or rerun after correcting the evidence |
| Interrupted run | Inspect the last report, if one was written, and current click-TT state; earlier approvals may already be saved. Rerun after resolving the interruption |

For browser inspection without saving changes:

```powershell
pnpm run approve --dry-run --debug
```

Debug mode shows the browser, slows actions and pauses on fatal page-shape errors. Press Enter in the terminal when finished inspecting. Use `--no-halt-on-error` to continue instead of pausing.

Other useful options:

- `--group "Bezirksoberliga Erwachsene"`: narrow the configured responsibility to one exact group.
- `--report-dir reports/my-run`: choose where reports and snapshots are saved.
- `--process-all`: inspect every in-scope detail page, including normally skipped statuses; use for investigation, starting with `--dry-run`.
- `--recheck`: validate past completed reports including approved reports, and export fines without changing click-TT approvals. Overrides `--process-all` to keep the past-match restriction.
- `--fine-workbook "data/audit.xlsx"`: override the output workbook path for this run; `--recheck` creates it if missing.

The normal command checks, approves eligible reports and exports findings in one run. Do not run the raster/optimization commands for this workflow.
