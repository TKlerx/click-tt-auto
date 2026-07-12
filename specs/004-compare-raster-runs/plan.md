# Implementation Plan: Raster Run Comparison

**Branch**: `004-compare-raster-runs` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-compare-raster-runs/spec.md`

## Summary

Add comparable scheduling scenarios on top of the existing raster webapp. A scenario is either an optimizer run result
(`Initial heuristic` or `CP-SAT`) or a scored manual assignment. All scenarios for the same district, season, and input
set expose the same KPI summary, status, detail links, and staleness state so admins can compare them side by side and
use manual plans as real baselines.

## Technical Context

**Language/Version**: TypeScript 5.9 strict for webapp/root raster code; Python 3.12 for the existing CP-SAT subprocess
**Primary Dependencies**: Existing Next.js 16, React 19, Prisma 7, better-auth, next-intl, zod, Tailwind/shadcn; existing root `src/raster/*`; existing Python OR-Tools CP-SAT script
**Storage**: Existing Prisma SQLite dev / PostgreSQL prod schema, extended with scenario/manual-assignment fields as needed
**Testing**: Vitest for units/routes/services; Playwright for the smallest user-flow smoke checks
**Target Platform**: Existing `webapp/` dashboard plus existing background worker
**Project Type**: Web application feature layered on the raster planning pipeline
**Performance Goals**: Compare at least three compatible scenarios within 30 seconds after they exist; manual entry/import usable for a 40-group season within 15 minutes
**Constraints**: Reuse existing optimizer/scoring code; no fake progress percentages; failed/no-solution runs stay visible but are not valid assignment scenarios
**Scale/Scope**: One district-season input set at a time; hundreds of teams/assignments per scenario

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0 permits the raster review webapp in `webapp/` and requires reuse of the planning pipeline.

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Focused click-TT Administration Suite | PASS | Extends capability 3; reuses `src/raster/*` and `scripts/solve-raster-cpsat.py`. |
| II. Safety-First Automation | PASS | Feature remains read-only toward click-TT and compares proposals only. |
| III. Credential Security | PASS | No new credential flow. |
| IV. Idempotent & Resumable | PASS | Scenarios are immutable-ish records; new runs/manual scores create new comparable results. |
| V. Observable Output | PASS | Status, KPI summary, and details are first-class scenario fields. |
| VI. Quality Gates | PASS | Existing root/webapp validation commands remain the gate. |

**Gate result**: PASSES. No constitution exception required.

## Project Structure

### Documentation (this feature)

```text
specs/004-compare-raster-runs/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
```text
src/raster/
├── optimize/                 # existing heuristic optimizer
├── score/                    # existing KPI/conflict derivation to reuse for all scenarios
└── types.ts

scripts/
└── solve-raster-cpsat.py     # existing CP-SAT solver invoked by worker

webapp/
├── prisma/schema.postgres.prisma
├── src/app/(dashboard)/raster/
├── src/app/api/raster/
├── src/components/raster/
├── src/lib/raster/
├── src/services/raster/
├── tests/unit/
├── tests/e2e/
└── worker/
```

**Structure Decision**: Implement 004 inside the existing 003 raster webapp. Do not fork the optimizer or create a
separate comparison app. Add only the persistence/API/UI needed to treat existing run outputs and manual assignments as
comparable scenarios.

## Complexity Tracking

No constitution violations.
