# Quickstart: Combined WTTV Planning

**Feature**: `006-combined-wttv-planning` | **Date**: 2026-07-14

---

## The one thing to internalise

This feature lets you start runs the system would previously have refused. That is safe **only** because every run records what it did not see.

If you build the combined selection without the coverage record, you have built a machine for producing plausible-looking plans that quietly omit three Bezirke. That is worse than not building it. User Stories 1 and 2 are both P1 for this reason — they ship together or not at all.

---

## Orientation

| What | Why |
|---|---|
| `specs/006-combined-wttv-planning/spec.md` § Clarifications | The feature was reshaped mid-conversation. The original gated all-WTTV framing is gone |
| `specs/005-raster-guided-navigation/` | This sits on 005. Its scope keying (FR-020) and readiness derivation are the foundation |
| `webapp/src/lib/raster/solver-io.ts` | Where a multi-scope solver input gets assembled |
| `webapp/src/services/raster/runs.ts` | Where the coverage record gets frozen |
| `specs/003-raster-review-webapp/spec.md` line 37 | "A full WTTV or district run may proceed with zero fixed numbers" — why FR-013 needs no solver change |

---

## Build order

### Stage 0 — Prerequisite

1. Feature 005 must be in: the scope-keyed input set, and ideally `RasterSnapshot.district` rekeyed too (research R-104 — it belongs in 005, but this feature needs it gone).
2. Verify `RasterOptimizationRun` is empty (data-model.md, spec Q4). If runs exist, they cannot honestly be given a coverage record — stop and reconsider rather than invent history.

### Stage 1 — User Stories 1 + 2 together (both P1)

Not separable. A subset run without a coverage record is the failure mode above.

1. `RasterInputSetScope` join table; combined input set spanning ≥ 2 scopes.
2. Coverage columns on the run + `lib/raster/coverage.ts`.
3. Freeze coverage in the run-creation transaction. **One caller.**
4. `/raster/combined`: scope multi-select, gaps shown before starting.
5. Multi-scope solver input, fixed upper-league numbers omitted.
6. Incomplete marking in run and snapshot lists.

**Verify**: two Bezirke, one with excluded groups and missing wishes → run starts, is not refused, produces a snapshot marked incomplete naming the gaps. Then fill the gaps → the old run's record is unchanged.

### Stage 2 — User Story 3 (P2)

Scope narrowing inside a combined snapshot; snapshot states which scopes it covers.

### Stage 3 — User Story 4 (P3)

Cross-scope readiness overview, aggregating 005's per-scope readiness.

---

## Verification against success criteria

| SC | How |
|---|---|
| SC-001 | Start a combined run over two Bezirke with gaps; it is not refused |
| SC-002 | An incomplete run is distinguishable in a list and on opening |
| SC-003 | An incomplete run names what it did not see, from the run itself |
| SC-004 | A combined run assigns upper-league Rasterzahlen rather than inheriting them |
| SC-005 | Change the inputs after a run; its record is unchanged |
| SC-006 | Single-scope planning behaves identically, plus a coverage record |
| SC-007 | A user cannot include or see a scope they cannot access |
| SC-008 | Add Bezirke to a selection until runs stop completing acceptably — this is how Q1 gets answered |
| SC-009 | From the readiness overview, reach the step that fixes a gap in one interaction |

Run `webapp/validate.ps1` before commit — constitution Principle VI.

---

## Traps

- **Recomputing coverage on render.** Passes every test where data has not changed; silently rewrites history when it has. Coverage describes *then*, readiness describes *now* — never one code path (R-103).
- **`complete` = `spannedAll`.** A run spanning every scope *with gaps* is incomplete. Both halves, always (FR-034).
- **Scoping coverage to combined runs.** FR-035: single-scope runs get it too. That is what settles 005's Q4.
- **Recording A/B absence as a gap.** It is a legitimate value (FR-033). Recording it trains readers to ignore the gap list.
- **Adding a `force` flag.** There is nothing to force past — FR-012 removes the refusal entirely.
- **Predicting solver behaviour.** Don't. Q1 is measured, not estimated (R-106). Keep the existing 300s default and leave it configurable.
- **Making the owning `scopeId` nullable.** 005's design deliberately allows a spanning row alongside an owning scope. A null key pushes a branch through every existing query (R-101).
- **A combined selection of one scope.** That is the normal flow. Refuse it.

---

## Out of scope

Any change to what the optimizer optimizes for; the solver itself; import parsers; which snapshot wins when combined and single-scope disagree (Q3, operational); the wall-clock limit (Q2, awaits Q1's evidence); the WTTV-wide scheduler (007's FR-014 — not needed, since FR-015 only requires that a user cannot include scopes they cannot access).
