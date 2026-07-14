# Quickstart: Guided Raster Navigation

**Feature**: `005-raster-guided-navigation` | **Date**: 2026-07-14

How to get oriented, build this, and verify it did what the spec asked.

---

## Orientation: read these five things first

| What | Why |
|---|---|
| `webapp/src/app/(dashboard)/raster/page.tsx` | The 571 lines being taken apart. Everything the four steps must cover is here |
| `webapp/src/app/(dashboard)/raster/layout.tsx` | Seven lines, `return children`. Becomes the nav host |
| `webapp/src/services/raster/` | Twelve services, already split along step lines. Reused unchanged — if you are rewriting one, stop |
| `webapp/src/lib/raster/access.ts` | Scope resolution. The `code`-or-`name` match is what this feature ends |
| `specs/005-raster-guided-navigation/spec.md` § Clarifications | Five decisions that are not re-litigable. Group exclusion especially |

**The one thing to internalise**: a season is planned as **one input set per scope**, and groups whose wishes have not arrived are **excluded** so the rest can run. Exclusion is a stopgap — the goal is one run covering the whole Bezirk. A nav that shows "Review data ✓ done" while three groups sit excluded has failed the feature.

---

## Build order

Follows the spec's user story priorities. Each stage is independently verifiable.

### Stage 0 — Scope keying (prerequisite)

Not a user story; everything else sits on it.

1. Verify the data is discardable **before** changing anything (research R-006): no `RasterHallCapacity` with `basis = REVIEWED`, no `RasterReviewDecision` rows. If either exists, stop — FR-024's premise has expired.
2. `RasterInputSet.district` → `scopeId` FK; `RasterHallCapacity.district` → `scopeId` FK. Drop and recreate; no conversion.
3. `access.ts`: resolve scope by `code` only. Delete the code-or-name match.
4. `lib/raster/scope-level.ts`: Bezirk/Verband from hierarchy position.
5. Selector offers Bezirke and the Verband, never Germany (FR-023, FR-004a).

**Verify**: create an input set for OWL and one for WTTV. Both work, both are labelled by level, neither says "District".

### Stage 1 — User Story 1: the four steps (P1)

1. Route segments: `import`, `review`, `run`, `runs`. `page.tsx` becomes a redirect.
2. `layout.tsx` hosts the scope/season picker and the step nav.
3. Move existing components into their steps — **move, do not rewrite**.
4. `lib/raster/readiness.ts` (needed now for the default-step redirect, FR-004a).

**Verify**: every capability from the old page is reachable from exactly one step (SC-005). Reload and share a step URL; the step, scope and season survive (FR-004).

### Stage 2 — User Story 2: matching review, once (P2)

1. `RasterMatchReview` + `RasterMatchRecordType`.
2. `lib/raster/match-review.ts`: fingerprint over normalised reviewed fields (data-model.md).
3. `match-review` endpoints.
4. Matching review renders in Review data; Run optimizer must not show it (FR-007).

**Verify**: review once, start three runs, never asked again (SC-003). Re-upload one club's PDF with a change — only that club goes outstanding (SC-004). Re-parse an unchanged PDF — nothing changes (FR-010a).

### Stage 3 — User Story 3: readiness (P3)

1. Readiness in the nav with blocked reasons and resolving step (FR-011, FR-012).
2. `hasExclusions` throughout (FR-011a, FR-006e).
3. Exclusion surfaced as a way to proceed (FR-006c, FR-012a); arriving wishes resurface it (FR-006f).

**Verify**: exclude a group — it stops blocking, keeps showing as deferred, and no step reads as unqualified ready (SC-013).

---

## Verification against success criteria

| SC | How |
|---|---|
| SC-001 | Open Raster; four steps named and ordered without scrolling |
| SC-003 | Review once, run three times, no re-review |
| SC-004 | Refresh one club's source; only that club outstanding |
| SC-005 | Enumerate the old page's capabilities; each in exactly one step |
| SC-006 | Block a run on capacities; nav names the cause and reaches the step in one click |
| SC-008 | Scope level visible without opening a menu |
| SC-009 | Reimport a scope from sources; reach a started run with no manual repair |
| SC-010 | With wishes missing, exclude and reach a started run without leaving the flow |
| SC-012 | Open Raster; land on the step needing attention |
| SC-013 | A Bezirk with exclusions never reads as fully planned |
| SC-014 | Wishes arrive; include without hunting for what was excluded |

Run `webapp/validate.ps1` (typecheck + lint) before commit — constitution Principle VI.

---

## Traps

- **Rewriting services.** The twelve in `services/raster/` are fine. This feature re-composes callers.
- **A four-value readiness enum.** It cannot say "ready, but three groups excluded". FR-011a needs exclusion alongside state, not folded into it.
- **Fingerprinting raw text.** Whitespace churn then re-opens reviews, breaking FR-010a in practice while passing it in theory. Normalise first.
- **Assuming the data is empty.** Check (R-006). The one path here that destroys unrecoverable work.
- **Treating exclusion as done.** The correction that shaped this spec. Excluded is deferred.
- **Building an input-set selector.** FR-006a: there is no selector. Variants are not run as parallel input sets.
- **Widening who can act.** Seven hardcoded `PLATFORM_ADMIN` checks in the page are wrong, and feature 007 fixes them. Not here — move them as-is.

---

## Out of scope

Fuzzy club/team matching (T079–T082 on the 004 branch), combined WTTV planning (feature 006), who-can-do-what (feature 007), snapshot contents including whether a partial run's snapshot is marked (Q4, deferred to this plan's own follow-up).
