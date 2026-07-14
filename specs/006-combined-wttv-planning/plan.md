# Implementation Plan: Combined WTTV Planning

**Branch**: `006-combined-wttv-planning` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-combined-wttv-planning/spec.md`

## Summary

Let an admin plan several scopes together as one optimization problem — any subset from two Bezirke up to the whole Verband — with incomplete inputs allowed and recorded rather than refused. Every run gains a persisted coverage record naming what it spanned and what it lacked, written at start and never revised, so a two-Bezirk experiment with gaps can never be mistaken for a finished plan. The record covers single-scope runs too, which settles feature 005's Q4.

Technical approach: an input set gains a *set* of scopes via a join table rather than changing the owning `scopeId` that feature 005 introduces — FR-026 of 005 kept that design open for exactly this. Coverage is a queryable flag plus a detail payload on the run, so lists can distinguish incomplete runs without opening them. The optimizer itself is unchanged: a combined run simply supplies no fixed upper-league Rasterzahlen, which `003` already established it accepts ("a full WTTV or district run may proceed with zero fixed numbers").

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js LTS 22.x; Python 3.12 for the existing CP-SAT solver, invoked as a subprocess  
**Primary Dependencies**: Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod, Tailwind 4 / shadcn — all present; this feature adds none  
**Storage**: PostgreSQL via `webapp/prisma/schema.postgres.prisma`  
**Testing**: vitest (unit/integration), Playwright (e2e)  
**Target Platform**: Next.js server + background worker  
**Project Type**: Web application, confined to `webapp/`  
**Performance Goals**: Deliberately unstated at the top end — see Constraints. A two-Bezirk run should behave much like a single-scope run.  
**Constraints**: Solver behaviour above one Bezirk is unestablished (spec Q1). This plan does **not** predict it; subset runs make it measurable (SC-008). The existing 300-second default is likely wrong for combined runs (Q2).  
**Scale/Scope**: One Bezirk ≈ hundreds of assignments. Verband + 13 Bezirke ≈ 1,400 clubs/teams with upper-league Rasterzahlen newly unfixed — more decision freedom, not less. Subsets sit anywhere between.

**Depends on feature 005** for the scope-keyed input set (its FR-020) and the guided flow. 005's FR-026 exists to keep the spanning input set here buildable; this plan is the test of whether it succeeded. It does — see research R-101.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0.

| Principle | Assessment |
|---|---|
| **I. Focused click-TT Administration Suite** | PASS. Within `webapp/`, capability 3. No new dependency. The webapp MAY invoke the Python CP-SAT solver as a subprocess, which is all a combined run does. FR-013 changes what is *supplied* to the solver (no fixed upper-league numbers), not the solver itself. |
| **II. Safety-First Automation** | PASS — see the note below, which is the one point worth arguing. Read-only toward click-TT throughout. |
| **III. Credential Security** | PASS. Untouched. |
| **IV. Idempotent & Resumable** | PASS. FR-038 (written at start, never revised) is an immutability guarantee. Combined runs are asynchronous and observable like any other (FR-018). |
| **V. Observable Output** | PASS, and materially advanced. A run that does not say what it failed to see is unobservable in exactly the way this principle objects to. FR-030–FR-037 are its implementation. |
| **VI. Quality Gates** | PASS. TypeScript strict, ESLint, Prettier, `webapp/validate.ps1`. |

**Result: no violations. Complexity Tracking not required.**

**On Principle II, stated rather than filed as a violation**: this feature *removes a refusal*. FR-012 means the system will start runs it would previously have blocked for incomplete inputs, and Principle II says "when in doubt, skip and report for manual review" and "never trade safety for convenience". One could read this as exactly that trade.

It is not, for two reasons. The doubt here is not resolved by refusing — it is resolved by recording. And the reason for wanting incomplete runs is *to see what the optimizer does without complete constraints*, which is diagnostic work the principle exists to enable rather than prevent; refusing it would be safety theatre that removes information rather than adding it.

But the obligation does transfer. Principle II's guarantee survives only because FR-034 marks the result. That is why User Story 2 is P1 *alongside* User Story 1 rather than after it: shipping subset runs without the coverage record would be a genuine violation, not a partial delivery.

## Project Structure

### Documentation (this feature)

```text
specs/006-combined-wttv-planning/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── combined-runs.md
├── checklists/
│   └── requirements.md  # From /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
webapp/
├── prisma/
│   └── schema.postgres.prisma           # RasterInputSetScope join; coverage columns on the run;
│                                        # RasterSnapshot.district -> scope set (see research R-104)
├── src/
│   ├── app/
│   │   ├── (dashboard)/raster/
│   │   │   ├── combined/page.tsx        # new: scope multi-select, gap summary, start
│   │   │   ├── readiness/page.tsx       # new: cross-scope readiness overview
│   │   │   ├── runs/page.tsx            # from 005: gains the incomplete marking
│   │   │   └── snapshots/[id]/page.tsx  # gains scope narrowing + coverage display
│   │   └── api/raster/
│   │       ├── combined/route.ts        # new: create combined input set, start run
│   │       └── readiness/route.ts       # new: cross-scope readiness
│   ├── components/raster/
│   │   ├── combined/                    # new: scope picker, pre-run gap summary
│   │   └── coverage/                    # new: incomplete badge, coverage detail
│   ├── lib/raster/
│   │   ├── coverage.ts                  # new: compute and freeze the record
│   │   ├── readiness-across-scopes.ts   # new: aggregates 005's per-scope readiness
│   │   └── solver-io.ts                 # existing: emit multi-scope input, omit fixed upper-league numbers
│   └── services/raster/
│       ├── combinedInputSets.ts         # new
│       └── runs.ts                      # existing: writes the coverage record at start
└── tests/
    ├── unit/                            # coverage computation and freezing
    ├── integration/                     # subset runs, marking, access
    └── e2e/                             # combined run walkthrough
```

**Structure Decision**: Existing web application under `webapp/`, extended in place on top of feature 005's guided flow. The combined selection and the readiness overview become two new route segments **alongside** 005's four steps rather than a fifth step — neither belongs to a single scope's workflow, which is precisely what those steps are keyed on. `readiness-across-scopes.ts` composes 005's per-scope `readiness.ts` rather than restating its rules; if 005's readiness is right, this is an aggregation and nothing more.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
