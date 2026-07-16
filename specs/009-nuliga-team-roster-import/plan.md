# Implementation Plan: nuLiga Team Roster Import

**Branch**: `009-nuliga-team-roster-import` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-nuliga-team-roster-import/spec.md`

## Summary

Give the system a canonical answer to "which teams exist in this Bezirk and season, and in which group" by importing the nuLiga admin Tabellen export — which carries the `VereinNr` the click-TT scraper drops. The CLI downloads it beside the wish PDFs it already collects and bundles them; the webapp takes that bundle as one upload, and refuses to import it silently when it is incomplete.

Technical approach: the CLI half is an increment on a working authenticated Playwright session. The webapp half is a new source type, a roster model, and an unzip path. The only genuinely delicate part is the character set, where the wrong choice fails silently rather than loudly.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js LTS 22.x — both halves  
**Primary Dependencies**: CLI — Playwright, dotenv, minimist (all present). Webapp — Next.js 16, Prisma 7, zod (all present). **One new dependency is likely**: a zip reader for the webapp's bundle path (FR-019a), justified below.  
**Storage**: PostgreSQL via `webapp/prisma/schema.postgres.prisma`. New roster tables; no existing model changes.  
**Testing**: vitest (root and webapp), Playwright (webapp e2e)  
**Target Platform**: CLI (Node) for collection; Next.js server for import  
**Project Type**: Spans capability 1 (CLI) and capability 3 (webapp) — the only feature so far that does  
**Performance Goals**: None meaningful. 404 rows is a small file; the ~5-second export wait dominates.  
**Constraints**: The export defaults to ISO-8859-15 and can be UTF-8. ISO-8859-15 cannot fail to decode, so a wrong guess corrupts silently rather than erroring. The webapp must not authenticate against click-TT.  
**Scale/Scope**: OWL 2026/27 = 404 teams, 85 clubs, 43 groups, 16 Ligen. One export per Bezirk and season; 13 Bezirke exist.

**Depends on feature 005**, structurally: `RasterTeamRoster.scopeId` uses 005's scope-keyed model. Against 004 the equivalent is a `district` string — the free-text scope-shaped string 005 exists to remove — so building this first would plant a fourth carrier of the defect 005 is removing from three. data-model.md and tasks.md both state this; an earlier draft of this plan omitted it, which is the same failure `/speckit.analyze` caught on feature 007 (a dependency claim that contradicted the tasks), here by silence rather than by a wrong claim.

**Feature 008 depends on this**, softly. 008 anchors wish-conflict pairing on the identity this supplies, but ships without it — unpaired rows surface for manual matching rather than duplicating silently (008's FR-003a). This makes 008's review quieter; it does not unblock it.

**Verified rather than assumed**: `src/config.ts:135-137` defaults `baseUrl` to `https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa`, and `src/auth.ts:31` navigates there to sign in. **The CLI already authenticates against nuLiga admin.** The spec flagged FR-014's "one login reaches both" as an assumption to test; it is not an assumption, it is current behaviour. `scrapeSeasonModel` (`src/raster/ingest/scrape.ts:91-107`) already launches Chromium with `acceptDownloads: true` and collects wish PDFs into `reports/raster/clicktt-downloads`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0.

| Principle | Assessment |
|---|---|
| **I. Focused click-TT Administration Suite** | PASS, with one dependency to justify (below). The feature spans capabilities 1 and 3, which the constitution permits and describes: the CLI does credentialed browser automation, the webapp does ingestion and review. Neither stack leaks into the other. |
| **II. Safety-First Automation** | PASS, and the principle this design turns on. Downloading an export is read-only toward click-TT — it generates a report, it does not modify league data. The webapp never authenticates (FR-018). "Where parsing is uncertain, flag for manual review rather than guessing" is precisely FR-012 (refuse when the character set is unclear) and FR-019b (say what a bundle lacks). |
| **III. Credential Security** | PASS. Credentials stay in `.env` and stay in the CLI. `CLICK_TT_USERNAME` / `CLICK_TT_PASSWORD` already exist and already reach nuLiga admin; this adds no new secret and no new place one is held. |
| **IV. Idempotent & Resumable** | PASS. FR-004 requires re-import to change nothing. FR-015 requires a failed export wait to save nothing partial, rather than leave a truncated file a later run might treat as valid. |
| **V. Observable Output** | PASS, and materially advanced. Both silent-failure modes — mojibake and half-imported bundles — become refusals with stated reasons (FR-012, FR-019b/c). |
| **VI. Quality Gates** | PASS. TypeScript strict, ESLint, Prettier; `validate.ps1` for the CLI half and `webapp/validate.ps1` for the webapp half. |

**Result: no violations.** One dependency needs justifying rather than a Complexity Tracking entry.

### Dependency justification: zip, on both sides

Principle I permits additional dependencies "when narrowly scoped and justified in a feature plan (e.g. a pure-JS PDF reader, Excel I/O)", while requiring the CLI keep production dependencies minimal. The webapp stack is governed separately.

- **CLI side** (FR-017, writing the bundle): a pure-JS zip **writer**. Node's standard library has `zlib` (deflate) but no archive writer, so this cannot be done with what is already present. Narrowly scoped: one format, one code path, invoked once at the end of a collection run. Same category as the pure-JS PDF reader and Excel I/O the constitution names as acceptable.
- **Webapp side** (FR-019a, reading the bundle): a pure-JS zip **reader**, inside `webapp/`, where the minimal-dependency rule does not bind and the stack is governed separately.

Neither is a native binary or a heavyweight framework, which is what the rule guards against.

**An earlier draft of this plan avoided the CLI dependency** by having the CLI emit a directory for the admin to zip by hand. That contradicted FR-017 and US3-AS4, which require the CLI to emit a bundle — and it inverted the rule's intent. Principle I asks that dependencies be *justified*, not avoided at the cost of the requirement. `/speckit.analyze` caught it; research R-303 records the reversal.

## Project Structure

### Documentation (this feature)

```text
specs/009-nuliga-team-roster-import/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── roster-import.md
├── checklists/
│   └── requirements.md  # From /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/                                   # CLI — capability 1
├── config.ts                          # baseUrl already nuLigaAdminTTDE.woa; gains export options
└── raster/ingest/
    ├── scrape.ts                      # already authenticates + downloads wish PDFs
    ├── nuliga-export.ts               # new: Downloads page, request export, await link
    └── roster-csv.ts                  # new: charset-aware Tabellen parse (shared, see R-302)

webapp/
├── prisma/
│   └── schema.postgres.prisma         # new: RasterTeamRoster, RasterRosterTeam
├── src/
│   ├── app/api/raster/
│   │   ├── sources/upload/route.ts    # existing: gains the bundle path
│   │   └── roster/route.ts            # new: roster read for review
│   ├── lib/raster/
│   │   ├── pipeline.ts                # existing: the bridge the CSV parser crosses (precedent)
│   │   └── bundle.ts                  # new: unzip, classify, report what is missing
│   └── services/raster/
│       └── roster.ts                  # new
└── tests/
    ├── unit/                          # charset, parse, bundle classification
    └── integration/                   # import, re-import, mismatch reporting

data/
└── Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv   # fixture (see R-305)
```

**Structure Decision**: Both existing projects, extended in place. The CLI gains two modules under `src/raster/ingest/` beside the scraper they build on; the webapp gains a source type, a roster model, and a bundle path. No new top-level project.

The structural question is where the CSV parse rules live, since both halves need them and Principle I forbids the webapp stack leaking into the CLI. Research R-302 settles it: the parser is plain TypeScript with no framework dependency, so it lives in `src/raster/ingest/` and the webapp consumes it exactly as it already consumes the wish-PDF parser — through `webapp/src/lib/raster/pipeline.ts`, which exists and is the precedent (`rasterIngest.parseWishesPdf`).

## Complexity Tracking

> No violations. The zip dependency is justified in the Constitution Check above rather than tracked here.
