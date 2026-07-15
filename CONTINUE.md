# Continue

<!-- continuity:fingerprint=a154eb9b8ab512593148f30be0dd1b836b76491c08656e8f7fa7888a175b6f38 -->

## Current Snapshot

- Updated: 2026-07-13 17:25:31
- Branch: `004-compare-raster-runs`

## Recent Non-Continuity Commits

- 7b64f38 Document parsed identity review backlog
- 132b3f1 Fix raster source club identity merge
- 0e74822 Use youth match duration in capacity checks
- 5a46663 Deduplicate wishes for capacity inference
- b2d7458 Account for start times in capacity checks

## Git Status

- M eslint.config.mjs
-  M scripts/solve-raster-cpsat.py
-  M specs/004-compare-raster-runs/spec.md
-  M specs/004-compare-raster-runs/tasks.md
-  M src/raster/ingest/model.ts
-  M src/raster/score/evaluate.ts
-  M src/raster/score/penalties.ts
-  M src/raster/types.ts
-  M tests/unit/cpsat-solver.test.ts
-  M tests/unit/ingest.test.ts
-  M validate.ps1
-  M webapp/next-env.d.ts
-  M webapp/package.json
-  M webapp/prisma/schema.postgres.prisma
-  M webapp/src/app/(dashboard)/raster/page.tsx
-  M webapp/src/app/(dashboard)/raster/snapshots/[id]/page.tsx
-  M webapp/src/app/api/raster/capacity/route.ts
-  M webapp/src/app/api/raster/runs/[id]/route.ts
-  M webapp/src/components/raster/capacity/capacity-table.tsx
-  M webapp/src/components/raster/input-set-actions.tsx
-  M webapp/src/services/raster/capacity.ts
-  M webapp/src/services/raster/inputSets.ts
-  M webapp/src/services/raster/manualAssignments.ts
-  M webapp/src/services/raster/runs.ts
-  M webapp/src/services/raster/snapshots.ts
-  M webapp/tests/e2e/helpers/db-worker.ts
-  M webapp/tests/e2e/helpers/db.ts
-  M webapp/tests/e2e/raster-generate.spec.ts
-  M webapp/tests/unit/raster-capacity-service.test.ts
-  M webapp/tests/unit/raster-performance.test.tsx
-  M webapp/validate.ps1
-  M webapp/vitest.config.ts
-  M webapp/worker/src/starter_worker/db.py
-  M webapp/worker/src/starter_worker/main.py
-  M webapp/worker/tests/test_main.py
- ?? webapp/prisma/migrations-postgres/20260713103000_add_raster_run_archive/
- ?? webapp/tests/unit/raster-runs-service.test.ts

## Active Specs

- 004-compare-raster-runs

## Next Recommended Actions

1. 004-compare-raster-runs: T045 [Backlog] Add infeasibility diagnostics that identify which hard constraint family blocks a CP-SAT run in `scripts/solve-raster-cpsat.py` and `webapp/worker/src/starter_worker/main.py`
2. 004-compare-raster-runs: T046 [Backlog] Show infeasibility diagnostics next to the no-solution run state in `webapp/src/components/raster/input-set-actions.tsx`
