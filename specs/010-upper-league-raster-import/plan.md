# Implementation Plan: Upper-League Raster Import

**Branch**: `010-upper-league-raster-import` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-upper-league-raster-import/spec.md`

## Summary

A Bezirk plan must respect the WTTV planner's already-decided upper-league Rasterzahlen: a club's Verbandsliga/Landesliga team occupies the club's hall on its home weeks, and the Bezirk optimizer must plan around it. Today the webapp applies none of this — `buildSeasonModelFromAssignments` runs with no fixed rows, `RasterFixedRasterzahl` never reaches the solver, and `parseGroupsPdf` is not wired into the webapp (and scores 0/10 on the real document anyway).

Approach: (1) rewrite the Gruppen-und-Raster PDF parser to read the real layout and pass its skipped contract test; (2) import the parsed result as a per-scope `RasterSource` row; (3) when a Bezirk run's season model is built, inject that scope's clubs' upper-league teams as fixed, capacity-relevant, non-planned teams — hall and home day drawn from the club's wish, Rasterzahl and group from the import; (4) record what was matched, excluded, or absent in feature 006's coverage record. The capacity mechanism already works (PR #22); this feature supplies the teams.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict) for the webapp and `src/raster` ingest; Python 3.12 for the CP-SAT solver/worker (unchanged by this feature)
**Primary Dependencies**: Next.js 16 (App Router), Prisma 7 (PostgreSQL), `pdfjs-dist` via existing `src/raster/ingest/pdf-text.ts`; existing raster ingest/season-model pipeline
**Storage**: PostgreSQL. Reuses the existing `RasterSource` table (scope + season + `sourceType` + `parsedJson`); no schema migration (`sourceType` is free text)
**Testing**: Vitest (unit/integration), the existing skipped contract test `tests/unit/groups-pdf.test.ts`, and the capacity tests `tests/unit/upper-league-capacity.test.ts` (both from PR #22); Playwright for the import UI
**Target Platform**: Linux server (webapp) + Python worker
**Project Type**: Web application (Next.js webapp) with a shared TypeScript raster pipeline
**Performance Goals**: Parse the published PDF (~160 KB, ~1400 rows) in well under a run's setup time; no per-run re-parse (FR-011 stores the parsed result)
**Constraints**: Wrong upper-league numbers are worse than none (FR-007) — parser refuses rather than guesses; a club plan is unchanged when the club has no upper-league team (SC-006)
**Scale/Scope**: One published PDF per season for all of WTTV; ~13 Bezirke; a Bezirk imports and keeps only its own clubs' teams

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Simplicity First** — PASS. Reuses `RasterSource`, the season-model builder, the CP-SAT capacity mechanism, and 006's coverage record. The one genuinely new piece is the parser, which *replaces* a broken one rather than adding an abstraction.
- **II. Test Coverage** — PASS (with obligations). The parser has a waiting contract test and an oracle (`data/upper-fixed.csv`); capacity has tests. Tasks MUST add: parser unit tests (un-skip the contract test), model-injection integration tests, the name-mismatch/no-wish/absent-import cases, and an import-route test.
- **III. Duplication Control** — PASS. The parser rewrite removes, not adds, a duplicate path. Matching reuses the model's existing club/team identity rather than a second scheme.
- **IV. Incremental Delivery** — PASS. US1 (the constraint) is the MVP and is independently testable via the solver; US2 (import) and US3 (visibility) are separable increments in priority order.
- **VII. Azure OpenAI** — N/A. No LLM.
- **VIII. Web App Standards / IX. i18n / X. Responsive** — APPLIES to the import UI: base-path-correct routes, toast feedback, translation keys for all five locales, responsive layout. Tasks MUST include locale keys (en, de, es, fr, pt).
- **Technology Constraints** — PASS. TypeScript/Next 16/Prisma 7/Python worker/PostgreSQL, all existing. No new dependency.

No violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/010-upper-league-raster-import/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (parser + import API + injection)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/raster/ingest/
├── groups-pdf.ts            # REWRITE: real layout parser (leagues, entries, Rasterzahl, day/time, xxx)
└── pdf-text.ts              # reused as-is (text extraction)

webapp/src/
├── app/api/raster/sources/upload/route.ts   # extend: accept the Gruppen-und-Raster PDF sourceType
├── app/(dashboard)/raster/…                 # import view: upload + parsed preview + matched/unmatched (US2/US3)
├── lib/raster/pipeline.ts                   # expose the parser to the webapp
├── services/raster/upperLeague.ts           # NEW: load import, match to scope clubs, build injected teams
├── services/raster/inputSets.ts             # wire injected upper-league teams into the season model
└── lib/raster/coverage.ts                   # record matched/excluded/absent upper-league constraints
                                             # (FR-024/026), reusing 006's coverage record

webapp/tests/
├── unit/raster/groups-pdf.test.ts           # un-skip contract test (already present)
├── unit/upper-league-capacity.test.ts       # already present (PR #22)
├── integration/upper-league-injection.test.ts   # NEW: season-model injection + matching/exclusion
└── e2e/…                                     # import UI happy path

tests/fixtures/raster/gruppen-und-raster-2026.pdf   # already present (PR #22)
data/upper-fixed.csv                                 # oracle (already present)
```

**Structure Decision**: Web application with a shared `src/raster` TypeScript pipeline. The parser lives in the shared pipeline (used by CLI today, exposed to the webapp here). Storage, matching, injection, and coverage live in the webapp service layer. No new top-level structure; every path above already exists except the two NEW files.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
