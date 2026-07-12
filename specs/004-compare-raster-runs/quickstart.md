# Quickstart: Raster Run Comparison

## Prerequisites

1. Start the webapp with `APP_DATABASE_URL` or `DATABASE_URL` configured.
2. Use an existing validated raster input set for one district and season.
3. Ensure the worker is running for background optimizer jobs.

## Scenario 1: Compare Existing Runs

1. Open `/raster` for the district and season.
2. Open the scenarios/comparison area for a validated input set.
3. Confirm existing completed runs appear as scenarios.
4. Select two or more compatible scenarios.
5. Confirm the comparison shows objective, hall excess, affected clubs, wish misses, derby issues, status, and detail links.
6. Choose one scenario as baseline and confirm KPI deltas appear as better, worse, or unchanged.

Expected: incompatible scenarios from another district, season, or input set are not silently compared.

## Scenario 2: Run Alternative Optimizers

1. On a validated input set, start an `Initial heuristic` run.
2. Start a `CP-SAT` run with a visible time budget.
3. Watch status move through honest states such as queued/running/completed/feasible/failed.
4. After completion, confirm both runs appear in the same scenario list.

Expected: a feasible-but-not-proven CP-SAT result is still comparable; failed/no-solution runs stay visible as history.

## Scenario 3: Manual Assignment

1. Open manual assignment entry for the same input set.
2. Enter schedule numbers for teams by group, or paste/upload a simple group/team/schedule-number table.
3. Validate the draft.
4. Fix any duplicate, illegal, unknown, or missing assignment issues.
5. Score the valid draft.
6. Compare the resulting manual scenario against optimizer scenarios.

Expected: manual KPIs are computed by the same scoring definitions as optimizer scenarios.

## Minimal Validation Commands

```powershell
pnpm --dir webapp run typecheck
pnpm --dir webapp exec vitest run tests/unit
pnpm test -- tests/unit/evaluate.test.ts
```
