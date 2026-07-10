# Raster Open Points

## Webapp Generation Gap

- The webapp can collect/review wishes, fixed Rasterzahlen, hall capacities, imported snapshots, assignments, conflicts, and review decisions.
- The `raster_run` worker job currently transitions status and has OR-Tools available, but generated runs are not complete yet.
- To complete generated runs, the webapp still needs a persisted team/group context table or upload that answers: league, group, club, team label, division/category, and whether a row came from public click-TT or fixed upper-league data.
- Once that context exists, T022 can build solver input by joining: input-set wishes + fixed Rasterzahlen + hall capacities + team/group context.
- Until then, imported snapshots are the honest review path for webapp UI testing.

## CSV Pipeline

- Get all `Terminwünsche` PDFs for the whole district and place them in the configured input folder before producing the final review export.
- Review and complete `data/upper-fixed.csv`, generated from visible rows in `data/Gruppen-und-Raster-2026.pdf`.
- Re-run the staged CSV flow:
  - `admin-pdf-teams.csv` from the admin PDFs.
  - `public-team-context.csv` from the public click-TT league pages via `pnpm raster:public-context`.
  - `public-admin-team-review.csv` as the join.
- The current join review has one `missing-public-and-fixed` row: `TTV Lage e.V., Damen, Damen II`.
- The join review should have zero `missing-public-and-fixed` rows once public data plus fixed upper assignments cover every admin PDF team.
- Review `missing-admin-pdf-team` rows; these usually mean the current admin PDF set is incomplete for the scraped public scope.
- Add hall capacity rows only where capacity is constrained. Missing capacity means unlimited.
- Run the optimizer after the review CSVs and fixed assignments have been checked by a human.
