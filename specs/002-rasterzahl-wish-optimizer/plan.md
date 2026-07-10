# Implementation Plan: Rasterzahl Wish Optimizer

**Branch**: `002-rasterzahl-wish-optimizer` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-rasterzahl-wish-optimizer/spec.md`

## Summary

Add an **offline** Rasterzahl planning capability to the existing TypeScript CLI. It ingests the season's yearly inputs (club wishes, group assignment, fixed higher-league Rasterzahlen) from PDFs — and optionally scrapes them from click-TT — into a single human-reviewable model; scores a given Rasterzahl assignment for hall over-usage and broken wishes across the whole district; and searches for an assignment that minimizes a configurable weighted penalty, honoring fixed Rasterzahlen, per-group permutation validity, and the same-club derby (≤ Spieltag 3, fallback 4) constraint.

The scheduling math is a **table lookup over a pre-encoded constant** (the WTTV rulebook), not a solver: `research.md` verified against the published tables that Rasterzahl → home weeks, derby matchday, and gegenläufig/gleichläufig all fall out mechanically from the per-size templates. The only search is the assignment optimization.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js LTS (22.x) — same as the existing tool
**Primary Dependencies**: existing (Playwright, dotenv, minimist); **new**: a pure-JS PDF text extractor (`pdfjs-dist`) for the yearly input PDFs. Rulebook is encoded as a checked-in constant and is NOT parsed at runtime. Optimizer and scorer are implemented in-house (no solver dependency).
**Storage**: checked-in rulebook constant (`src/raster/rulebook/*.json`); reviewed season model + reports written to `reports/raster/` (git-ignored); no database
**Testing**: Vitest — unit tests on the scorer/derivation against the `research.md` reference values; parser tests against the sample PDFs
**Target Platform**: Windows (primary), cross-platform; fully offline for the core (scrape mode optional)
**Project Type**: CLI tool (second subcommand family alongside `approve`)
**Performance Goals**: none hard (SC-007) — correctness/optimality preferred; optimizer may run to convergence/exhaustion
**Constraints**: only Rasterzahl is chosen (weekday/hall/time fixed); fixed higher-league Rasterzahlen immutable; each group is a permutation of `1..N`; same-club derby ≤ ST3 (fallback ST4)
**Scale/Scope**: one district (~tens of groups, sizes 6–14 → 6/8/10/12/14er rasters, including explicit 6er Doppelrunde mode, a few hundred teams)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Focused CLI Toolkit | PASS (via amendment) | Constitution amended to v2.0.0 (2026-07-07) to reframe the project as an approval + planning toolkit and to allow narrowly-scoped, justified dependencies. The offline planner and `pdfjs-dist` now fall within scope. |
| II. Safety-First Automation | PASS | Read-only w.r.t. click-TT (scrape only). Output is a proposal the organizer reviews; nothing is written back. Human-review gate on parsed wishes (US1). |
| III. Credential Security | PASS | Scrape mode reuses `.env`; core needs no credentials. |
| IV. Idempotent & Resumable | PASS | Pure function of inputs; re-running yields the same model/score. Optimizer is deterministic given a seed. |
| V. Observable Output | PASS | Stdout summary + JSON report + inspectable model artifact. |
| VI. Quality Gates | PASS | TypeScript strict, ESLint, Prettier, validate.ps1; new deps limited to one PDF lib. |

## Project Structure

### Documentation (this feature)

```text
specs/002-rasterzahl-wish-optimizer/
├── spec.md              # Feature spec (clarified)
├── research.md          # Rulebook decode + verified 12er reference
├── plan.md              # This file
├── data-model.md        # Phase 1 — entities & model schema
├── quickstart.md        # Phase 1 — how to run
├── contracts/
│   └── cli.md           # Phase 1 — subcommand + config contract
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── (existing approval tool: index.ts, auth.ts, navigation.ts, …)
├── raster-index.ts             # CLI entry for the `raster` subcommand family
└── raster/
    ├── rulebook/
    │   ├── templates.json       # per-size home/away grid (6/6d/8/10/12/14er)
    │   ├── cross-size.json      # korrespondierende Schlüsselzahlen (im Wechsel / zeitgleich)
    │   ├── spielwochen.json     # Spieltag → week-slot per size
    │   └── rulebook.ts          # typed loader + lookups (home weeks, derby ST, parity)
    ├── ingest/
    │   ├── wishes-pdf.ts        # parse Terminmeldung PDFs → structured wishes + free-text
    │   ├── wishes-freetext.ts   # extract im Wechsel/zeitgleich relations (rule-based, review-flagged)
    │   ├── groups-pdf.ts        # parse group assignment + fixed higher-league Rasterzahlen
    │   ├── scrape.ts            # OPTIONAL click-TT scrape (reuses auth/navigation) — US4/P3
    │   └── model.ts            # assemble + validate the SeasonModel; emit editable artifact
    ├── score/
    │   ├── derive.ts            # Rasterzahl+size → home weeks / derby ST (via rulebook)
    │   ├── penalties.ts         # hall over-usage, im Wechsel, zeitgleich, Spielwoche A/B
    │   └── evaluate.ts          # score an assignment → EvaluationResult
    ├── optimize/
    │   ├── components.ts        # split into independent coupled components
    │   └── search.ts            # branch-and-bound per component + local-search fallback
    ├── report/
    │   └── reporter.ts          # stdout summary + JSON report
    └── types.ts                 # SeasonModel, Team, Wish, Assignment, EvaluationResult, …

reports/raster/                  # generated model + reports (git-ignored)

tests/
└── unit/
    ├── rulebook.test.ts         # verify decoded templates vs research.md (all sizes)
    ├── derive.test.ts           # home-week/derby derivation
    ├── penalties.test.ts        # each penalty type on crafted cases
    ├── evaluate.test.ts         # end-to-end score vs hand-computed reference
    └── ingest.test.ts           # parser against sample PDFs
```

**Structure Decision**: Isolate everything under `src/raster/` with its own CLI entry (`raster-index.ts`, `npm run raster`), so the offline planner and the live approval tool stay cleanly separated and share only the optional `auth.ts`/`navigation.ts` for scrape mode. The rulebook is checked-in constant data (encoded once from `Rasterzahlen_OWL_komplett.pdf`), keeping the runtime free of any dependence on that PDF.

## Key Design Decisions

1. **Rulebook as encoded constant.** Decode the per-size templates (including the official 6er Doppelrunde table), cross-size tables, and Spielwochen once into checked-in JSON; a unit test re-verifies each size against its published Gegenläufige/same-club tables the way `research.md` did for 12er. No runtime PDF parse of the rulebook (FR-021).
2. **Scorer = pure lookups.** `derive.ts` turns (Rasterzahl, size) into a home-Spieltag set and, via Spielwochen, a home-week set; derby matchday and gegenläufig/gleichläufig are direct table reads. Cross-size sibling relations use `cross-size.json` (FR-005/008/009). Cheap and exact → satisfies SC-001/002/003.
3. **Penalty model = weighted sum** (FR-018): configurable weights for hall over-usage, broken im Wechsel, broken zeitgleich, broken Spielwoche A/B. Hard constraints (permutation, fixed Rasterzahlen, derby ≤4) are enforced structurally, not penalized.
4. **Optimizer exploits decomposition.** Clubs couple groups only where a club has related teams; the assignment problem splits into independent components. Solve each by branch-and-bound (no time limit → exact where the component is small), with a local-search fallback (simulated annealing) for any large component. Implemented in-house to avoid a heavy solver dependency.
5. **Human-in-the-loop ingest.** The misaligned wish tables and free-text relations are parsed best-effort, every low-confidence field flagged, and the whole `SeasonModel` emitted as an editable artifact the organizer confirms before scoring (US1, FR-002/003).
6. **PDF path first, scrape later.** PDF ingestion is the P1 guaranteed path; click-TT scrape (US4/P3) is an alternate front-end producing the same `SeasonModel`.

## Complexity Tracking

Resolved by constitution amendment v2.0.0 (2026-07-07) — no outstanding violations. For the record, the two items that drove the amendment:

| Item | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Second capability (offline planner) in the same repo | The organizer's other big manual job is Rasterzahl planning; shares the domain, click-TT source, and CLI/report conventions | A separate repo would duplicate auth/navigation, config, and build/quality tooling, and fragment a single-user toolkit |
| New dependency: `pdfjs-dist` | Yearly inputs arrive as PDFs that must be parsed | Shelling out to `pdftotext` adds a non-portable native binary; hand-transcription each season is error-prone and defeats the tool's purpose |
