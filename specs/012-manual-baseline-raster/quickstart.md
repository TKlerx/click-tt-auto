# Quickstart: Manual Baseline Rasterzahlen Import

## Prerequisites

- PostgreSQL development database migrated and seeded
- `CLICK_TT_USERNAME`, `CLICK_TT_PASSWORD`, and `CLICK_TT_URL` configured
- Playwright Chromium installed
- A planning workspace with a parsed season model

## Validation flow

1. Open the workspace review page as a scheduler.
2. Start the manual baseline import.
3. Verify click-TT is traversed through the live admin UI and every stored row includes group, team, Rasterzahl, source location, and timestamp.
4. Verify exact season-model matches settle automatically and ambiguous, unmatched, duplicate, or invalid rows appear in one review list.
5. Map, ignore, or accept every unresolved row; verify status becomes `READY`.
6. Refresh the import and verify compatible mapping decisions carry forward while the prior version remains in history.
7. Force a crawl failure and verify the previous active baseline remains usable.
8. Start one run with the baseline and one without it.
9. Verify only the baseline-linked snapshot shows unchanged/changed/new/missing deltas and neither run gains fixed constraints from baseline values.
10. Repeat the pages as a read-only scope user; verify data is visible but no import/review controls or write-on-read behavior exists.

## Automated checks

```powershell
pnpm test -- --run tests/unit/manual-baseline-scrape.test.ts
pnpm --dir webapp test -- --run tests/unit/raster-manual-baseline-service.test.ts tests/integration/raster-manual-baseline-api.test.ts
pnpm --dir webapp exec playwright test tests/e2e/raster-manual-baseline.spec.ts
pwsh -File ./validate.ps1
```
