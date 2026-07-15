# Implementation Plan: Guided Raster Navigation

**Branch**: `005-raster-guided-navigation` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-raster-guided-navigation/spec.md`

## Summary

Rework the single 571-line Raster page into four addressable steps behind a nested left navigation — Import data, Review data, Run optimizer, Review optimization runs — keyed on an explicit scope reference plus a season instead of today's free-text `district` string. Relocate the source-to-model matching review into Review data and make it stick per record until the source material behind that record actually changes. Surface group include/exclude as Review data's main lever, while never letting an excluded group read as settled work.

Technical approach: keep every existing service in `webapp/src/services/raster/` intact and re-compose them behind route segments under the existing pass-through `raster/layout.tsx`. Three things are genuinely new: a scope foreign key on the input set, a per-record matching review table with source fingerprints, and a readiness derivation used by both the nav and the default-step redirect. Everything else is a move.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js LTS 22.x  
**Primary Dependencies**: Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod, Tailwind 4 / shadcn — all already present in `webapp/`; this feature adds none  
**Storage**: PostgreSQL via `webapp/prisma/schema.postgres.prisma` (single schema; no dev SQLite schema in this repo)  
**Testing**: vitest (unit/integration), Playwright (e2e) — both already configured  
**Target Platform**: Next.js server + browser, reverse-proxy friendly via `withBasePath`  
**Project Type**: Web application, confined to `webapp/`  
**Performance Goals**: No regression against today's page. The current page eagerly loads input sets, sources, scenarios, capacities *and* runs a per-input-set capacity review on every render; splitting into steps should load strictly less per view.  
**Constraints**: No production data (spec FR-024), so schema changes may drop and recreate Raster rows rather than migrate. Existing validation and capacity gates must keep holding (FR-014).  
**Scale/Scope**: District scale — hundreds of assignments/conflicts per snapshot. 13 Bezirke + Verband seeded. One 571-line page, ~13 raster components, 12 raster services, ~25 raster API routes in play.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0 (amended 2026-07-10, which added the Rasterzahl Review Webapp as capability 3).

| Principle | Assessment |
|---|---|
| **I. Focused click-TT Administration Suite** | PASS. Entirely within `webapp/`, capability 3. No CLI change. No new dependency — the web stack in use is exactly the permitted one, and nothing leaks into `src/`. |
| **II. Safety-First Automation** | PASS. Read-only toward click-TT; this feature reorganises review UI and adds no write path to click-TT. Reinforces the principle: FR-006e/FR-011a exist so a partially-planned Bezirk cannot be mistaken for a complete one, and FR-014 keeps existing gates. |
| **III. Credential Security** | PASS. No credential surface touched. |
| **IV. Idempotent & Resumable** | PASS. FR-010a is an idempotence requirement in disguise: re-parsing a source that yields identical data must change nothing. Step navigation is stateless and derived. |
| **V. Observable Output** | PASS. Improves it — FR-012 requires a blocked step to state its cause and the step that resolves it, replacing today's silent disabled button. |
| **VI. Quality Gates** | PASS. TypeScript strict, ESLint, Prettier, `webapp/validate.ps1` before commit. |

**Result: no violations. Complexity Tracking not required.**

Two points deserving explicit note rather than a violation:

- FR-024 authorises discarding existing Raster data instead of migrating it. This is safe only because no production deployment exists. Principle II ("when in doubt, skip and report") argues the implementation should *verify* emptiness rather than assume it — see research.md R-006.
- Spec Q4 (marking a partial run's snapshot) is **declined** here rather than deferred again, with the residual risk stated — see research.md R-008. Principle V (Observable Output) is the reason it cannot simply be dropped: a snapshot that does not say it covered nine of twelve groups is unobservable in exactly the way that principle objects to. The gap is real, sits outside the guided flow, and is the same gap feature 006 must close for combined snapshots.

## Project Structure

### Documentation (this feature)

```text
specs/005-raster-guided-navigation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── raster-steps.md
├── checklists/
│   └── requirements.md  # From /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
webapp/
├── prisma/
│   └── schema.postgres.prisma          # RasterInputSet.district -> scope FK; new RasterMatchReview
├── src/
│   ├── app/
│   │   └── (dashboard)/
│   │       └── raster/
│   │           ├── layout.tsx          # pass-through today -> hosts scope/season picker + step nav
│   │           ├── page.tsx            # 571 lines today -> redirect to default step
│   │           ├── import/page.tsx     # new step segment
│   │           ├── review/page.tsx     # new step segment
│   │           ├── run/page.tsx        # new step segment
│   │           ├── runs/page.tsx       # new step segment
│   │           └── snapshots/[id]/     # unchanged destination, not a step
│   ├── components/
│   │   └── raster/
│   │       ├── nav/                    # new: step nav + readiness badges
│   │       ├── sources/                # existing, moves under Import
│   │       ├── capacity/               # existing, moves under Review
│   │       ├── group-mode-review.tsx   # existing, moves under Review
│   │       ├── input-set-actions.tsx   # existing, splits across Review and Run
│   │       ├── scenario-comparison.tsx # existing, moves under Runs
│   │       └── ...                     # remaining components move, unchanged
│   ├── lib/
│   │   └── raster/
│   │       ├── access.ts               # scope resolution by FK rather than code/name string
│   │       ├── readiness.ts            # new: per-step readiness derivation
│   │       ├── match-review.ts         # new: per-record review state + fingerprints
│   │       └── scope-level.ts          # new: Bezirk/Verband classification for labels
│   └── services/
│       └── raster/                     # 12 existing services reused as-is
└── tests/
    ├── unit/                           # readiness, fingerprinting, scope-level
    ├── integration/                    # step routing, gates, review invalidation
    └── e2e/                            # guided flow walkthrough
```

**Structure Decision**: Existing web application under `webapp/`, extended in place. No new top-level project. The four steps become route segments under the existing `(dashboard)/raster/` group so each is addressable (FR-004) via the App Router rather than through client state. `raster/layout.tsx` is currently a pass-through (`return children`) and becomes the natural host for the persistent scope/season selection and the step navigation (FR-001, FR-003). The twelve services in `services/raster/` already decompose along step lines (`sources`, `inputSets`, `wishes`, `capacity`, `runs`, `scenarios`, `snapshots`) and are reused unchanged — this feature re-composes their callers, it does not rewrite them.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
