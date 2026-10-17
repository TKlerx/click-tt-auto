# Rasterzahl optimization

Operator guide for importing season inputs, assigning Rasterzahlen and reviewing proposals. Match approval, rechecking reports and Excel fines have a separate [manual](match-approval.md).

Optimization produces planning proposals. The CLI commands below read click-TT and write local files; they do not publish Rasterzahlen back to click-TT. The webapp stores inputs, runs, snapshots and review decisions in its database. Enter an accepted proposal into click-TT through your normal administrative process.

## 1. Choose the workflow and planning scope

Use the webapp for shared planning, input review and comparing saved runs. Use the CLI for local imports, reproducible solver runs and CSV exports. Keep the same season, group coverage, model and weights throughout a comparison.

**`CLICK_TT_GROUPS` belongs to the match-approval flow. It does not restrict raster scraping or optimization.** Raster imports can include other teams from the same clubs because their home matches affect hall usage. Review the imported group list before solving. In the webapp, select the correct scope, season and planning workspace; access depends on your assigned scopes and role.

Collect these inputs before starting:

| Input | What to verify |
| --- | --- |
| Groups and team lists | Correct season, divisions, team numbers and group sizes |
| Terminmeldungen / club wishes | Every relevant club is covered; weekday, hall, start time and A/B preferences match the source |
| Published upper-league Rasterzahlen | Fixed numbers belong to the same season and exact teams |
| Hall capacities | Actual simultaneous home-match capacity for each club/hall/weekday |
| Six-team group modes | Normal 6er or 6er Doppelrunde explicitly reviewed |
| Current/manual assignment | Useful as a baseline; it is separate from binding fixed numbers |

Keep the original PDFs and a copy of each reviewed model, weights file and result. Default CLI filenames are reused and can overwrite earlier exports; copy each completed run to a dated folder before repeating it. `reports/` and local PDFs are ignored by Git.

## 2. Webapp: import, review, run, compare

Open `/raster` and choose your scope and season. Follow the planning navigation:

1. **Import data** (`/raster/import`): create or select a named planning workspace. Import the season/group sources, Terminwünsche, upper-league Rasterzahlen and any roster data needed by your workflow. Check source parsing results and resolve conflicting or unmatched wish rows. Sources belong to the selected workspace; check it before replacing an upload.
2. **Review** (`/raster/review`): resolve missing club/team mappings and model warnings. Confirm which groups are planned and which are excluded. Review fixed numbers, gym capacities, inferred capacities and six-team group modes. An inferred capacity needs your judgment; it is not proof of the real hall limit.
3. Optionally import the current click-TT numbers as a **manual baseline** on the review page. Resolve unmatched or ambiguous teams and duplicates before using the baseline. A failed refresh keeps the previous active baseline. Selecting a baseline for a run provides comparison data; it does not freeze its numbers. Use fixed Rasterzahlen for binding constraints.
4. **Readiness** (`/raster/readiness`): inspect missing items across your accessible scopes and follow the links to resolve them.
5. **Run optimizer** (`/raster/run`): select the workspace, review the settings, validate and queue a run. A background worker must be running. Refresh to see progress and open the resulting snapshot when available.
6. Review assignments, conflicts, wishes and comparison results in the saved snapshot. A run with excluded groups is provisional. If sources changed after the run was queued, review or rerun against the new inputs before accepting the result.

For a Bezirk-only run, matched upper-league imports provide fixed, input-only teams that constrain hall usage. Combined planning (`/raster/combined`) plans across scopes and decides upper-league numbers through its own combined path. Do not assume the two modes freeze the same teams.

Six-team Doppelrunde uses the ten first-half matchdays from its template. Plan again after the mid-season break; do not treat it as a complete full-season assignment.

If you operate a local webapp, follow [webapp setup and worker instructions](../webapp/README.md#docker-deployment). Local development uses PostgreSQL, and `pnpm --dir webapp run worker:dev` starts the worker. Avoid running both a local worker and a Docker worker unintentionally against the same database. CLI setup below is independent of the webapp database.

## 3. CLI setup and import

Run commands from the repository root. Install Node.js 22 or later and the pnpm version in `package.json`. CP-SAT additionally needs `uv` and Python 3.12; its script declares the OR-Tools dependency.

```powershell
pnpm install
pnpm exec playwright install chromium
```

For authenticated imports, set `CLICK_TT_USERNAME`, `CLICK_TT_PASSWORD` and `CLICK_TT_URL` in the local `.env` as described in the [approval manual](match-approval.md#2-configure-your-responsibility-and-season-workbook). Do not commit credentials or captured admin pages.

### Import through live click-TT navigation

First export the current numbers for comparison, then build the model:

```powershell
pnpm run raster:assignment
pnpm run raster -- ingest --from-clicktt --out reports/raster/model.json --current reports/raster/current.json --review reports/raster/review-input.csv
```

The current-assignment export is `reports/raster/team-raster-assignment.json` plus its CSV. `ingest --current` reads that JSON to map numbers into the model. Refresh it for the same season before importing; a missing export can leave the comparison assignment incomplete.

The importer clicks through live admin pages, downloads group-level `Terminmeldungen (pdf)` and verifies that each PDF contains the clicked group title. Do not replay captured `nuLigaAdminTTDE.woa/wo/...` URLs: their stateful click counters can return a different group or PDF.

To include public team context, explicitly supply the correct season's league index:

```powershell
pnpm run raster -- ingest --from-clicktt --public-league "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/leaguePage?championship=Ostwestfalen/Lippe%2026/27" --out reports/raster/model.json --current reports/raster/current.json --review reports/raster/review-input.csv
```

Optional import flags:

- `--fixed data/upper-fixed.csv`: import binding external assignments; see the [CSV/JSON schema](raster-fixed-assignments.md).
- `--capacity data/hall-capacity.csv`: constrain modeled hall usage. CSV columns are `club,hall,weekday,capacity`; weekdays use English names such as `friday`. Blank hall or weekday broadens a row. Missing CLI capacity means unlimited capacity, so it can hide real conflicts.

### Import local PDFs instead

```powershell
pnpm run raster -- ingest --wishes data/Terminmeldung_gesamt_bol.pdf --groups data/Gruppen-und-Raster-2026.pdf --out reports/raster/model.json
```

Repeat `--wishes` for multiple PDFs. This path builds a model from local inputs and does not automatically create a current-assignment file. Review the extracted model before solving. In particular, verify that the group list covers the intended planning scope rather than assuming a PDF filename defines it.

### Review the model

Inspect `model.json` and, for a live import with `--current`, `review-input.csv`. Confirm team identities, `group.teamIds`, hall/day assignments, wishes, fixed numbers, six-team modes and warnings. Fix the source and re-import, or preserve an explicitly reviewed copy of the model. Free text and absolute calendar restrictions require manual checking; the presence of a PDF note does not mean the optimizer enforces it.

The older CSV reconciliation tools remain useful for checking coverage:

```powershell
pnpm exec tsx scripts/export-admin-pdf-teams.ts data/Terminmeldung_gesamt_bol.pdf data/Terminmeldung_gesamt_1bl1.pdf data/Terminmeldung_gesamt_1bl2.pdf
pnpm run raster:public-context "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/leaguePage?championship=Ostwestfalen/Lippe%2026/27"
pnpm run raster:join-review reports/raster/public-team-context.csv reports/raster/admin-pdf-teams.csv data/upper-fixed.csv
```

Pass your actual PDF paths explicitly; the export script's fallback list includes historical machine-specific paths. Inspect `public-admin-team-review.csv`: resolve `missing-public-and-fixed` and review `missing-admin-pdf-team` rows. See [PDF extraction expectations](raster-pdf-extraction-expectations.md) for column meanings; its sample counts describe an earlier input set, not a universal target.

`pnpm run raster:review-model` converts that join into `review-model.json`, but currently starts with an empty `wishes` array and filters out rows without a group or public team. It is a reconciliation starting point, not a replacement for a fully reviewed season model with wishes and fixed context. Do not solve it unchanged merely because the script completed successfully.

## 4. Score the baseline and optimize

Evaluate a current assignment against the reviewed model:

```powershell
pnpm run raster -- score --model reports/raster/model.json --assignment reports/raster/current.json --report reports/raster/current-eval.json --unmet reports/raster/current-unmet.csv
```

### TypeScript search

```powershell
pnpm run raster -- optimize --model reports/raster/model.json --start reports/raster/current.json --out reports/raster/proposal.json --report reports/raster/proposal-eval.json --csv reports/raster/optimized-assignment.csv --unmet reports/raster/unmet-wishes.csv
```

Omit `--start` if there is no baseline; the CLI constructs a starting assignment. This search evaluates permutations for small groups and uses pair swaps for larger groups. It does not prove a global optimum. `--pin "teamId=7"` binds a model team for this invocation; use the exact model ID and include the same pin in any model you later use to reproduce or score that constraint.

### CP-SAT

```powershell
pnpm run raster:optimize-cpsat --model reports/raster/model.json --out reports/raster/proposal-cpsat.json --metadata reports/raster/proposal-cpsat-metadata.json --time-limit 300 --workers 8
pnpm run raster -- score --model reports/raster/model.json --assignment reports/raster/proposal-cpsat.json --report reports/raster/proposal-cpsat-eval.json --unmet reports/raster/unmet-wishes-cpsat.csv
pnpm run raster:spielwoche-overages reports/raster/model.json reports/raster/proposal-cpsat.json reports/raster/spielwoche-overages-cpsat.csv
pnpm run raster:optimized-review reports/raster/model.json reports/raster/proposal-cpsat.json reports/raster/optimized-raster-review-cpsat.csv
```

Read solver metadata before using the assignment:

| Status | Meaning and action |
| --- | --- |
| `OPTIMAL` | Best objective proven for the supplied model and weights; still review input completeness and conflicts |
| `FEASIBLE` | An assignment was found, but optimality was not proven; compare `objective` and `bestBound`, and allow more time if useful |
| `INFEASIBLE` | No assignment satisfies the modeled hard constraints; inspect fixed numbers, group membership and derby constraints |
| `UNKNOWN` or `MODEL_INVALID` | No usable assignment from this run; inspect the failure and settings |

On a failed solve, an older file at `--out` may still exist. Use fresh output filenames or verify metadata from the same invocation before opening the assignment.

Both solvers use weighted penalties. Lower objective is better only when model and weights match. Default weights are `overUsage: 10`, `overUsageFairness: 1`, `wechsel: 5`, `zeitgleich: 5`, `sameClubDerbySt4: 1000`, `spielwoche: 0`. Hall overflow and its distribution across clubs are penalized; a feasible assignment can still have hall overloads. Spielwoche rhythm misses are reported but carry no objective cost at the default weight of zero.

To change priorities, copy [weights.example.json](../specs/002-rasterzahl-wish-optimizer/weights.example.json), adjust it and pass `--weights data/my-weights.json` to the solver and every corresponding `score` command. Keep that file with the result.

## 5. Review and retain the result

Compare baseline and proposal with the same model and weights. Check these separately:

- `hardViolations` and `perGroup`: valid assignments, preserved fixed numbers and same-club derby timing.
- `overUsages` and the overages CSV: actual hall/day/week collisions, including upper-league context.
- `wishResults` and unmet-wishes CSV: fulfilled, unfulfilled, unfulfillable and unknown wishes. Resolve unknown evidence manually.
- `spielwocheMisses`: A/B rhythm conflicts, even when their weight is zero.
- Coverage: excluded groups, unmatched clubs, incomplete PDFs and free-text requests can invalidate a seemingly good score.

The optimized review CSV lists league, group, club, team, Rasterzahl, fixed/optimized status, weekday, hall, start time and week slot. Review it with the source wishes before transferring accepted numbers to click-TT. Retain the exact model, baseline, weights, assignment, metadata and evaluation together so someone else can reproduce the decision.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Wrong groups imported | Inspect the raster model/webapp scope; changing `CLICK_TT_GROUPS` will not limit raster imports |
| Import fails or PDF title mismatches | Repeat live navigation and check season/group; never replay a saved admin link |
| Missing club/team or wrong Roman team number | Resolve source mappings before trusting wishes, capacities or fixed numbers |
| Six-team run blocked | Confirm normal 6er versus Doppelrunde in the review step |
| Run remains pending | Check the webapp background job and worker connected to the same database |
| Low objective but visible conflicts | Inspect overloads, unknown/unfulfilled wishes, weight-zero terms and missing inputs |
| Hall conflicts absent unexpectedly | Verify capacities are present; missing CLI capacity is unlimited |
| Baseline differs from fixed constraints | Baseline is comparison data; use fixed/pinned numbers to bind assignments |
| Old result appears after failed CP-SAT solve | Check the new metadata and use a fresh output path |

Developer and historical notes remain in [README](../README.md#rasterzahl-planner), [fixed assignment formats](raster-fixed-assignments.md) and [open points](raster-open-points.md).
