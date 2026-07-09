# Raster open points

- Get all `Terminwünsche` PDFs for the whole district and place them in the configured input folder before producing the final review export.
- Generate the fixed upper Rasterzahlen CSV/JSON from `data/Gruppen-und-Raster-2026.pdf` using the schema in `docs/raster-fixed-assignments.md`.
- Re-run the staged CSV flow:
  - `admin-pdf-teams.csv` from the admin PDFs.
  - `public-team-context.csv` from the public click-TT league pages.
  - `public-admin-team-review.csv` as the join.
- The join review should have zero `missing-public-and-fixed` rows once public data plus fixed upper assignments cover every admin PDF team.
- Review `missing-admin-pdf-team` rows; these usually mean the current admin PDF set is incomplete for the scraped public scope.
- Add hall capacity rows only where capacity is constrained. Missing capacity means unlimited.
- Run the optimizer after the review CSVs and fixed assignments have been checked by a human.
