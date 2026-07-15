# Phase 1 Data Model: Guided Raster Navigation

**Feature**: `005-raster-guided-navigation` | **Date**: 2026-07-14

Three changes to persisted data. Everything else this feature does is a re-composition of existing state.

1. `RasterInputSet` and `RasterHallCapacity` are keyed to a `Scope` by foreign key instead of a free-text `district` string (FR-020, FR-024).
2. A new `RasterMatchReview` records, per reviewed record, that its source-to-model match was reviewed and against what content (FR-009, FR-010).
3. Nothing else. Group planning status, capacity basis, input set status, runs and snapshots are unchanged.

---

## Changed: RasterInputSet

**Today**: `district: String` — no relation, resolved by matching `Scope` on `code` **or** `name`, at any hierarchy level. This is what allowed "district" to hold `WTTV` unnoticed.

**Becomes**: an owning scope reference.

| Field | Change | Notes |
|---|---|---|
| `district: String` | **removed** | Replaced by the relation below |
| `scopeId: String` | **added** | FK to `Scope`. Required. |
| `scope: Scope` | **added** | Relation, `onDelete: Restrict` — a scope with input sets must not vanish underneath them |
| `season: String` | unchanged | |
| everything else | unchanged | `name`, `status`, `seasonModelJson`, `groupAssignmentJson`, `wishesJson`, `createdBy*`, relations to wishes/runs/fixedRasterzahlen/manualAssignmentDrafts |

**Indexes**: `@@index([scopeId, season, createdAt])` replaces `@@index([district, season, createdAt])`.

**Uniqueness**: none added. Deliberate — see Validation Rules below.

**Constraint (FR-023, FR-004a of feature 007)**: `scopeId` must reference a Bezirk or the Verband. Not expressible in Prisma; enforced in the service layer and covered by tests.

---

## Changed: RasterHallCapacity

Included because it carries the *same* scope-shaped string with the same defect. Leaving it as text while the input set moves to a foreign key guarantees the two drift apart — which is how the current `rbac.ts` / `access.ts` divergence arose.

| Field | Change | Notes |
|---|---|---|
| `district: String` | **removed** | |
| `scopeId: String` | **added** | FK to `Scope`. Required. |
| `scope: Scope` | **added** | Relation |
| `clubId`, `hall`, `weekday`, `capacity`, `basis`, `updatedBy*` | unchanged | |

**Uniqueness**: `@@unique([scopeId, clubId, hall, weekday])` replaces `@@unique([district, clubId, hall, weekday])`.  
**Indexes**: `@@index([scopeId, clubId])` replaces `@@index([district, clubId])`.

---

## Changed: RasterSnapshot

The **third** carrier of the scope-shaped string, and the one this plan originally missed (found 2026-07-15 while planning feature 006). The schema holds `district: String` in three places; rekeying two of them leaves the third to drift, and leaves a released schema still carrying the defect this feature exists to remove.

| Field | Change | Notes |
|---|---|---|
| `district: String` | **removed** | |
| `scopeId: String` | **added** | FK to `Scope`. Required. The snapshot's owning scope |
| `scope: Scope` | **added** | Relation |
| `origin`, `optimality`, `stale`, conflict counts, `objectiveBreakdown`, `runId`, relations | unchanged | |

**Indexes**: `@@index([scopeId, createdAt])` replaces `@@index([district, createdAt])`.

Feature 006 adds a spanned-scope set for combined snapshots. That is additive and changes nothing here — one owning `scopeId` now, a set later, the same shape as the input set (research R-003, and 006's R-104).

---

## New: RasterMatchReview

Records that a specific record's source-to-model match was reviewed, and against what content, so a later source change can mark exactly the changed records outstanding while the rest stay settled (FR-009, FR-010, FR-010a).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `inputSetId` | `String` | FK to `RasterInputSet`, `onDelete: Cascade` — review state is meaningless without its input set |
| `recordType` | `RasterMatchRecordType` | `TEAM` initially; enum so club-level review can follow without a migration |
| `recordId` | `String` | The season-model team id. Not an FK — the season model lives in JSON, so referential integrity is the service layer's job |
| `fingerprint` | `String` | Hash of the normalised reviewed content (see below) |
| `reviewedById` | `String` | FK to `User`, `onDelete: Restrict` — who confirmed it |
| `reviewedAt` | `DateTime @default(now())` | |

**Uniqueness**: `@@unique([inputSetId, recordType, recordId])` — one review state per record.  
**Indexes**: `@@index([inputSetId])`.

### New enum: RasterMatchRecordType

```
TEAM
```

Single-valued today. Present so that reviewing at club granularity later is an enum addition rather than a schema redesign.

### What the fingerprint covers

The fields the matching review is actually about — nothing more, or unrelated churn re-opens reviews (failing FR-010a in practice); nothing less, or a real change slips through leaving a stale confirmed match.

- The matched wish identity (`wishMatchId`)
- The wish fields carried onto the team: `homeWeekday`, `hall`, `startTime`, `spielwochePref`
- The club/team identity the record resolved to

Computed over **normalised** values, reusing the existing normalisation shape in the current page (NFKD, diacritics stripped, non-alphanumerics removed, lowercased). Raw text would make whitespace and ordering churn look like change.

**Not covered**: group planning status, six-team raster mode, gym capacity. These are separately reviewed and separately gated; folding them in would couple unrelated invalidations.

### Derived state (not stored)

A record is **outstanding** when no `RasterMatchReview` row exists for it, or when its current fingerprint differs from the stored one. Never persisted — it is a comparison against live parsed data (research R-004).

---

## Unchanged, but load-bearing

These are read by this feature and must not be altered.

| Entity | Why it matters here |
|---|---|
| `Scope` | Germany → Verband → Bezirk. Becomes the input set's key. Level derived from hierarchy position (research R-005), not stored |
| Season model JSON (`RasterInputSet.seasonModelJson`) | Holds `groups[].planningStatus` (`include`/`exclude`), `groups[].rasterMode`, `teams[]` with wish fields and `wishMatchId`. Group exclusion (FR-006b–g) already persists here |
| `RasterHallCapacity.basis` | `REVIEWED \| INFERRED \| MISSING`. There is **no** reviewed flag beyond this; capacity review is recomputed per render by comparing stored against inferred |
| `RasterInputSet.status` | `READY` already gates run start. FR-014 keeps this |
| `RasterSource.scopeId` | Already a proper FK. The model this feature copies |
| `RasterOptimizationRun` | Untouched. Feature 006 adds the coverage record to it |

---

## Validation rules

| Rule | Source | Enforced |
|---|---|---|
| An input set's scope must be a Bezirk or the Verband, never Germany | FR-023 | Service layer + tests. Prisma cannot express "FK to a subset of rows" |
| One input set per scope and season is the working norm | FR-006a | **Not** a database constraint — see below |
| A review row exists at most once per record | FR-009 | `@@unique([inputSetId, recordType, recordId])` |
| Re-parsing identical data changes nothing | FR-010a | Fingerprint equality; unit-tested directly |
| An excluded group is deferred, not settled | FR-006e | Readiness derivation; no schema involvement |

### Why one-input-set-per-scope-and-season is not a unique constraint

FR-006a says the flow acts on a single input set and offers no selector. It does **not** say the model forbids a second — the spec's Key Entities explicitly allows more ("the model permits several"), and the edge cases require the flow to cope if one appears.

A `@@unique([scopeId, season])` would also directly foreclose feature 006's spanning input set (FR-026), which needs a differently-shaped row for the same season. The uniqueness stays a workflow property, enforced by the flow resolving to one working subject, not by the database.

---

## Migration approach

Per FR-024 and research R-006: **no data migration.** The schema change drops and recreates rather than converting `district` strings to scope references.

The migration must first **verify** that irreplaceable data is absent, and fail loudly otherwise:

- `RasterHallCapacity` where `basis = REVIEWED` — hand-corrected values no reimport restores
- `RasterReviewDecision` — human decisions with notes and attribution

Everything else (sources, wishes, groups, input sets, runs, snapshots) is reimportable from the click-TT URLs and wish PDFs, so it may be discarded without a check.

If either check finds rows, the premise of FR-024 has expired and the requirement needs revisiting — which is precisely what the spec's load-bearing assumption says should happen. Assuming instead of checking is the one way this plan could destroy real work.
