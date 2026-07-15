# Implementation Plan: Wish Import Conflict Review

**Branch**: `008-wish-import-conflicts` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-wish-import-conflicts/spec.md`

## Summary

Stop wish imports overwriting wishes. Today an admin's correction is written straight into `RasterWish` and the next sync deletes it — live, silent data loss. This inverts the model: wishes become owned records, imports become proposals, and every difference is reviewed once and remembered.

Technical approach: retire **both** delete-and-recreate paths, add an import batch with parsed rows and conflicts, and record each decision against the imported value it ruled on. Nothing gates a run — unresolved conflicts are recorded on it, consistent with how 005 and 006 treat incomplete work.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js LTS 22.x  
**Primary Dependencies**: Next.js 16, React 19, Prisma 7, zod — all present; this feature adds none  
**Storage**: PostgreSQL via `webapp/prisma/schema.postgres.prisma`  
**Testing**: vitest (unit/integration), Playwright (e2e)  
**Target Platform**: Next.js server + browser  
**Project Type**: Web application, confined to `webapp/`  
**Performance Goals**: An import proposes rather than writes, so the work per import is comparable. A 50-team import with 10 conflicts must be resolvable without leaving the screen (SC-005).  
**Constraints**: No production data yet, so the loss is currently theoretical — it becomes real the moment OWL 2026/27 planning starts and corrections exist worth keeping.  
**Scale/Scope**: District scale. The OWL roster is 404 teams across 85 clubs, so a full import proposes hundreds of rows and a re-import should propose almost none.

**Verified against `main` after feature 005 landed** — the spec was written before 005 shipped, so its premise was re-checked rather than trusted:

- `replaceParsedWishes` (`webapp/src/services/raster/wishes.ts:22`) still runs `deleteMany({ where: { inputSetId } })` at line 33.
- **`replaceJsonWishes` (line 79) does the same at line 89** — a second delete path the spec originally missed, behind the structured-JSON fallback. FR-001b now names both.
- `updateWish` (line 116) still writes corrections directly into what those delete.
- `RasterWish` is unchanged by 005: no unique constraint, no active/imported distinction, no batch.
- `RasterMatchReview` exists exactly as 005 specified — `@@unique([inputSetId, recordType, recordId])`, fingerprint-based.

**Depends on feature 005** — merged and implemented. The conflict review lives in the Import data and Review data steps 005 created; without them it has no home.

**Soft-depends on feature 009** (not built). 008 anchors conflict pairing on canonical team identity, which 009 supplies. Buildable first: unpaired rows surface for manual matching rather than duplicating (FR-003a). The review is noisier, not wrong.

**Depends on feature 006 for one requirement** (not built). FR-009a records unresolved conflicts on a run using 006's coverage record — which does not exist in `main` (no `coverageComplete`). See research R-405: this feature must not wait for it, and must not grow a gate instead.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0.

| Principle | Assessment |
|---|---|
| **I. Focused click-TT Administration Suite** | PASS. Within `webapp/`, capability 3. No new dependency. |
| **II. Safety-First Automation** | PASS, and this feature is close to a direct expression of it. "Where parsing is uncertain, flag for manual review rather than guessing" is FR-003; "when in doubt, skip and report" is FR-002. The principle also says offline and webapp capabilities "produce proposals the human reviews" — which is precisely what an import becomes here. The current behaviour, where a parse silently overwrites a human's correction, arguably violates this principle today. |
| **III. Credential Security** | PASS. Untouched. |
| **IV. Idempotent & Resumable** | PASS, and materially advanced. Re-importing an unchanged PDF currently rewrites every wish; after this it changes nothing (FR-006) and re-raises nothing already decided (FR-004a). That is idempotence where there was none. |
| **V. Observable Output** | PASS. FR-010 keeps an audit trail of import decisions — source, previous value, imported value, chosen value, actor, time. FR-009a records what a run did not resolve. |
| **VI. Quality Gates** | PASS. TypeScript strict, ESLint, Prettier, `webapp/validate.ps1`. |

**Result: no violations. Complexity Tracking not required.**

**Worth stating**: FR-009 *reverses* the spec's original requirement that unresolved conflicts block runs. One could read Principle II as favouring the block — "when in doubt, skip". But there is no doubt about what to run: the active wish is well-defined at all times, and a run with open conflicts uses exactly what "keep existing" would have chosen. The doubt is about a *proposal*, not about the data. Blocking would refuse a valid run because a PDF suggested something different — safety theatre that removes a capability without removing a risk. The obligation transfers to FR-009a's recording, which is why that requirement matters more than its priority suggests.

## Project Structure

### Documentation (this feature)

```text
specs/008-wish-import-conflicts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── wish-imports.md
├── checklists/
│   └── requirements.md  # From /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
webapp/
├── prisma/
│   └── schema.postgres.prisma          # RasterWishImportBatch, RasterImportedWishRow,
│                                       # RasterWishConflict; RasterWish gains identity + state
├── src/
│   ├── app/
│   │   ├── (dashboard)/raster/
│   │   │   ├── import/page.tsx         # from 005: gains the import review
│   │   │   └── review/page.tsx         # from 005: gains missing-from-import
│   │   └── api/raster/input-sets/[id]/
│   │       ├── wishes/pdf/route.ts     # existing: proposes instead of replacing
│   │       ├── wishes/json/route.ts    # existing: same — the second delete path
│   │       └── wish-imports/route.ts   # new: batches, conflicts, decisions
│   ├── lib/raster/
│   │   ├── wish-diff.ts                # new: pair rows, compute differences
│   │   └── wish-identity.ts            # new: pair an imported row to a wish
│   └── services/raster/
│       ├── wishes.ts                   # replaceParsedWishes + replaceJsonWishes RETIRED
│       ├── inputSets.ts                # syncInputSetFromSources stops rewriting wishes
│       └── wishImports.ts              # new
└── tests/
    ├── unit/                           # diffing, decision matching, no-op detection
    ├── integration/                    # import proposes, re-import is silent, decisions stick
    └── e2e/                            # resolve 10 conflicts without leaving the screen
```

**Structure Decision**: Existing web application under `webapp/`, extended in place on feature 005's guided flow. The import review belongs in **Import data** (that is where a source arrives and where a proposal should be judged); the missing-from-import marker belongs in **Review data** (it is a property of the data, not of an import). Both steps exist.

The delete-and-recreate logic in `wishes.ts` is removed rather than adapted — see research R-401. That is the whole point of the feature, and a bulk delete taught to spare the right rows is the same bug with more code.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
