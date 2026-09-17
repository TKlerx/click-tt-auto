# Implementation Plan: Manual Baseline Rasterzahlen Import

**Branch**: `012-manual-baseline-raster` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-manual-baseline-raster/spec.md`

## Summary

Add a versioned, workspace-owned manual baseline imported through the existing authenticated click-TT Playwright assignment scraper. A successful refresh atomically replaces the active baseline; a failed refresh leaves the previous version active. Imported rows reuse the season model for exact matching, enter one review queue when uncertain, and preserve compatible review decisions across refreshes. A reviewed baseline can be attached to an optimization run strictly as comparison metadata, then rendered as deltas on the existing snapshot page. It never enters solver constraints.

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 22+ root CLI and Node.js 24 webapp runtime  
**Primary Dependencies**: Existing Playwright scraper, Next.js 16 App Router, React 19, Prisma 7, zod, better-auth, next-intl; promote the repo's existing `playwright` package into webapp production dependencies  
**Storage**: PostgreSQL; one migration adding versioned manual baseline/row tables and an optional baseline FK on `RasterOptimizationRun`  
**Testing**: Vitest root and webapp unit/integration tests; Playwright webapp E2E; captured page/row fixtures for crawler parsing  
**Target Platform**: Linux Azure Container Apps webapp with Chromium available to the app runtime  
**Project Type**: Existing CLI/shared raster library plus Next.js web application  
**Performance Goals**: One district import and review-ready result in under five minutes; result comparison is linear in baseline plus snapshot assignments  
**Constraints**: Live navigation only; never replay stateful admin URLs; previous active baseline survives failed refresh; scheduler-only writes; read-only rendering causes no crawl; baseline never becomes a solver constraint  
**Scale/Scope**: One active baseline per planning workspace, version history retained, normally tens to low hundreds of rows per import

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Focused click-TT Administration Suite — PASS.** This extends the existing Rasterzahl webapp and reuses the root planning/scraping pipeline. No fourth application or parallel optimizer is introduced.
- **II. Safety-First Automation — PASS.** The scraper only reads click-TT. Context validation is retained. Baselines are comparison-only and cannot silently become fixed assignments.
- **III. Credential Security — PASS.** Existing `CLICK_TT_*` environment variables remain the only credential source; no credentials are persisted in baseline rows or API payloads.
- **IV. Idempotent & Resumable — PASS.** Imports are versioned, concurrent refreshes are rejected, and activation is atomic. Failure preserves the previous active version.
- **V. Observable Output — PASS.** Baseline status, row counts, review counts, source context, and failure scope/step are persisted and shown.
- **VI. Quality Gates — PASS.** Strict TypeScript, ESLint, Vitest, Playwright, and `validate.ps1` remain the gates. The only dependency change is adding the repo's already-used Playwright package to the webapp runtime and installing its Chromium binary.

No constitution violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-manual-baseline-raster/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── manual-baseline-api.md
└── tasks.md
```

### Source Code (repository root)

```text
src/raster/ingest/
├── scrape.ts                              # reuse authenticated browser lifecycle
└── clicktt-assignments.ts                 # keep group/team/source context extraction

webapp/prisma/
├── schema.postgres.prisma                 # baseline, rows, run association
└── migrations-postgres/<timestamp>_manual_baseline/

webapp/src/
├── services/raster/manualBaselines.ts     # import lifecycle, matching, review, deltas
├── lib/raster/schemas.ts                  # request validation
├── app/api/raster/input-sets/[id]/baseline/
│   ├── route.ts                           # read active/history; start refresh
│   └── rows/[rowId]/route.ts              # map/ignore/accept review decision
├── app/api/raster/input-sets/[id]/runs/route.ts
├── app/(dashboard)/raster/review/page.tsx
├── app/(dashboard)/raster/snapshots/[id]/page.tsx
└── components/raster/baseline/
    ├── baseline-review.tsx
    └── baseline-comparison.tsx

webapp/tests/
├── unit/raster-manual-baseline-service.test.ts
├── integration/raster-manual-baseline-api.test.ts
└── e2e/raster-manual-baseline.spec.ts

tests/unit/
└── manual-baseline-scrape.test.ts          # captured row/context parsing

webapp/Dockerfile.app                       # install Chromium for the existing Playwright path
```

**Structure Decision**: Keep scraping in the existing root raster ingest library and persistence/UI in the webapp. Use the existing review page, run creation route, and snapshot page rather than creating parallel workflows. The import is request-driven and guarded by a database concurrency constraint; no second worker runtime is added merely to host Playwright.

## Complexity Tracking

No constitution violations.
