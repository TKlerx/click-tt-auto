# Phase 1 Data Model: Combined WTTV Planning

**Feature**: `006-combined-wttv-planning` | **Date**: 2026-07-14

Builds on feature 005's data model, which replaces the free-text `district` string with a scope reference on `RasterInputSet` and `RasterHallCapacity`.

Three changes:

1. `RasterInputSetScope` — an input set can span several scopes (FR-011).
2. Coverage columns on `RasterOptimizationRun` — what the run saw and what it lacked, frozen at start (FR-030–FR-038).
3. `RasterSnapshot` gains a spanned-scope set (FR-020), and — see the note — should lose its `district` string in feature 005.

---

## New: RasterInputSetScope

An input set's spanned scopes. A single-scope input set has no rows here; a combined one has a row per scope.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `inputSetId` | `String` | FK to `RasterInputSet`, `onDelete: Cascade` |
| `scopeId` | `String` | FK to `Scope`, `onDelete: Restrict` — a spanned scope must not vanish under a run |

**Uniqueness**: `@@unique([inputSetId, scopeId])`.  
**Indexes**: `@@index([scopeId])`.

### Why the owning `scopeId` stays

Feature 005 gives `RasterInputSet` a required `scopeId`. This feature does **not** make it nullable. A combined input set keeps an owning scope *and* carries spanned rows.

That is not sentiment about 005's design — every existing query filters input sets by scope, and a nullable key would push a null branch through all of them for the uncommon case. 005's research R-003 deliberately put the unique constraint on `(scopeId, season, name)` rather than `(scopeId, season)` so a spanning row could coexist. Nothing needs undoing; FR-026 held.

**Validation** (service layer, not expressible in Prisma):
- A combined input set has **two or more** spanned scopes. One is a single-scope run wearing a costume and should be refused (spec edge case).
- Every spanned scope must be accessible to the user creating it (FR-015).
- The owning `scopeId` must be among the spanned scopes.

---

## Changed: RasterOptimizationRun

Gains the coverage record. Nothing else about the run changes — it stays asynchronous and observable exactly as today (FR-018).

| Field | Change | Notes |
|---|---|---|
| `coverageComplete` | **added** — `Boolean` | True only when the run spanned every scope **and** had no input gaps. The queryable half: this is what a list filters on (FR-036) |
| `coverageJson` | **added** — `String @default("{}")` | The detail: scopes spanned, whether that was all of them, and the gaps (FR-031, FR-032) |
| everything else | unchanged | `status`, `outcome`, `settings`, `objectiveValue`, relations |

**Indexes**: `@@index([coverageComplete])` — FR-036 requires filtering lists by it.

### What `coverageJson` holds

Answers FR-031 and FR-032, and nothing else:

- **Scopes spanned**: their ids, and whether they were every scope that existed at the time
- **Excluded groups** (FR-032a): which groups were excluded from planning
- **Wish gaps** (FR-032b): teams with no matched wish, or a wish lacking game day, gym, or start time
- **Capacity gaps** (FR-032c): gym capacities missing, or stored below what the wishes require
- **Unresolved wish conflicts** (FR-032d / 008 FR-009a): unresolved import-conflict row ids and count at run start

**Not held**: game week A/B absence, which is a legitimate value rather than a gap (FR-033). Recording it would train readers to ignore the gap list.

### `coverageComplete` — the fragile field

True requires **both** halves: every scope spanned, and no gaps at all. It is the only case *not* marked incomplete (FR-034), which makes it simultaneously the rarest path and the one where being wrong does damage — a falsely-complete run is worse than an unmarked one, because it is trusted.

Feature 008's unresolved-conflict recording is absorbed here. Do not keep a second run metadata mechanism for it.

The likely defect is computing it from the scope set alone ("did we span everything?") and forgetting the gaps, since a full-scope run is the case someone reaches for when testing.

### Immutability

`coverageComplete` and `coverageJson` are written **once**, in the transaction that creates the run, and never updated (FR-038). Prisma cannot express this; it is held by convention and by test (research R-103).

The naive implementation recomputes on render. That passes every test where nothing changed, and silently rewrites history when something did — a run started with three groups excluded would claim it saw them once they were included. Coverage describes **then**; readiness describes **now**. They must never be the same code path.

---

## Changed: RasterSnapshot

| Field | Change | Notes |
|---|---|---|
| `district: String` | **should be removed in feature 005** | See below |
| `scopeId` | **added in feature 005** | FK to `Scope` — the owning scope |
| `spannedScopes` | **added here** | Relation to `RasterSnapshotScope` (FR-020) |
| everything else | unchanged | `origin`, `optimality`, `stale`, conflict counts, `objectiveBreakdown` |

### New: RasterSnapshotScope

Mirrors `RasterInputSetScope`.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `snapshotId` | `String` | FK to `RasterSnapshot`, `onDelete: Cascade` |
| `scopeId` | `String` | FK to `Scope`, `onDelete: Restrict` |

**Uniqueness**: `@@unique([snapshotId, scopeId])`.

### Note: `RasterSnapshot.district` belongs to feature 005

`RasterSnapshot.district` is a **third** free-text scope-shaped string, alongside the two feature 005 rekeys. 005's research R-003 justified including hall capacities on the grounds that "leaving it as text while the input set moves to an FK would guarantee they drift" — an argument that applies to snapshots identically. 005's plan missed it, and its cleanup task (T047) checks `webapp/src/` only, so it would not have caught a schema column.

The rekey belongs in 005 with the other two, so `district` leaves the schema in one step. The **spanned set** belongs here. If 005 ships without the rekey, this feature must do both — the worse order, because it releases a schema still carrying one scope-shaped string, which is exactly how the `code`-or-`name` ambiguity survived as long as it did.

---

## Unchanged, but load-bearing

| Entity | Why it matters here |
|---|---|
| `Scope` | Germany → Verband → Bezirk. Spanned scopes reference it |
| `RasterFixedRasterzahl` | Fixed numbers stay optional (FR-014). A combined run supplies none unless an admin did |
| `RasterInputSet.seasonModelJson` | Holds `groups[].planningStatus`. Excluded groups are read from here when freezing coverage |
| `RasterHallCapacity` | Capacity gaps (FR-032c) are computed against it, using 005's existing `blockingCount = missingCount + insufficientCount` rule |
| `RasterWishConflict` | Unresolved rows are frozen into `coverageJson.unresolvedWishConflicts` (FR-032d / 008 FR-009a) |
| `RasterAssignment`, `RasterConflict` | Unchanged. Scope narrowing (FR-022) filters them via their teams' scopes rather than by storing scope on each row |

---

## Validation rules

| Rule | Source | Enforced |
|---|---|---|
| A combined input set spans ≥ 2 scopes | edge case | Service layer + test |
| Every spanned scope is accessible to the creator | FR-015 | Service layer + API test |
| Coverage is written at run creation, never updated | FR-038 | Convention + test (SC-005) |
| `coverageComplete` requires all scopes **and** no gaps | FR-034 | `lib/raster/coverage.ts` + unit test |
| A/B absence is not a gap | FR-033 | `lib/raster/coverage.ts` + unit test |
| Incompleteness never blocks a run | FR-012 | Absence of a guard; integration test asserts a gapped run starts |

---

## Migration approach

Feature 005 discards rather than migrates Raster data (its FR-024), having first verified no `REVIEWED` capacity or review decision exists. This feature inherits that: it lands on a schema with no rows to convert.

**Spec Q4** (retrofitting coverage onto pre-existing runs) resolves the same way: there are none. The migration should nonetheless **verify** `RasterOptimizationRun` is empty rather than assume it, for the reason 005's R-006 gives — the assumption is load-bearing and was written earlier.

If runs do exist, they cannot honestly be given a coverage record: FR-038 requires it to describe what the run saw, and that is no longer knowable. Leaving them null-and-unmarked makes them indistinguishable from complete runs, which is the hazard this feature exists to remove. So: verify empty, and if not, stop and reconsider rather than invent history.
