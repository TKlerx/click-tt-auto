# Data Model: Manual Baseline Rasterzahlen Import

## RasterManualBaseline

One immutable import attempt/version for a planning workspace.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | String | CUID primary key |
| `inputSetId` | String | Required FK to `RasterInputSet`, cascade delete |
| `startedById` | String | Required FK to `User`, restrict delete |
| `status` | enum | `IMPORTING`, `REVIEW`, `READY`, `FAILED` |
| `active` | Boolean | At most one active baseline per input set; only `REVIEW` or `READY` may be active |
| `sourceSummaryJson` | String | Scope/group counts and non-secret source context |
| `errorJson` | String? | Failed scope/group/navigation step; no credentials or page dumps |
| `createdAt` | DateTime | Import start |
| `completedAt` | DateTime? | Crawl/storage completion |
| `activatedAt` | DateTime? | When this version replaced the prior active version |

Indexes/constraints:

- index `(inputSetId, createdAt)` for history
- partial unique index on `(inputSetId)` where `active = true`
- partial unique index on `(inputSetId)` where `status = 'IMPORTING'`

## RasterManualBaselineRow

One captured click-TT team assignment.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | String | CUID primary key |
| `baselineId` | String | Required FK to baseline, cascade delete |
| `sourceIdentityKey` | String | Normalized group + team identity; unique within baseline |
| `sourceGroupLabel` | String | Required original label |
| `sourceTeamLabel` | String | Required original label |
| `rasterzahl` | Int | Positive and valid for the resolved group schedule size when mapped |
| `sourceLocation` | String | Captured URL/context for provenance only; never replayed |
| `importedAt` | DateTime | Required capture time |
| `status` | enum | `MATCHED`, `REVIEW`, `IGNORED`, `ACCEPTED_UNRESOLVED`, `INVALID` |
| `targetTeamId` | String? | Workspace season-model team id; scalar because teams are stored in model JSON |
| `targetTeamLabel` | String? | Snapshot of reviewed target label |
| `issue` | String? | Ambiguity, missing team, duplicate, changed identity, or invalid range |
| `reviewedById` | String? | FK to `User`, set null on delete |
| `reviewedAt` | DateTime? | Decision timestamp |

Exact unique target matches become `MATCHED`. Every other non-settled row appears in the single review list. `READY` requires every row to be `MATCHED`, `IGNORED`, or `ACCEPTED_UNRESOLVED`.

## RasterOptimizationRun change

| Field | Change |
| --- | --- |
| `baselineId` | New nullable FK to `RasterManualBaseline`, `onDelete: Restrict` |

Run creation accepts no baseline or one `READY` baseline belonging to the same input set. The solver payload remains unchanged. The relation is immutable after run creation.

## Relationships

- `RasterInputSet 1 → many RasterManualBaseline`
- `RasterManualBaseline 1 → many RasterManualBaselineRow`
- `RasterManualBaseline 1 → many RasterOptimizationRun`
- `User 1 → many started/reviewed baseline records`

## State transitions

```text
IMPORTING → REVIEW → READY
IMPORTING → READY
IMPORTING → FAILED
REVIEW → READY
```

Refresh behavior:

1. Reject when another `IMPORTING` version exists for the workspace.
2. Create an inactive `IMPORTING` version.
3. Crawl and validate all available groups, then store rows.
4. Copy still-valid identity review decisions from the previous active version.
5. In one transaction, mark the new version `REVIEW` or `READY`, deactivate the previous baseline, and activate the new version.
6. On failure, mark only the new version `FAILED`; leave the previous active baseline untouched.

## Comparison projection (not persisted)

For a snapshot whose run has `baselineId`, compare settled mapped baseline rows with `RasterAssignment` by target team id:

- `unchanged`: both exist and Rasterzahl is equal
- `changed`: both exist and Rasterzahl differs
- `new`: snapshot assignment has no baseline row
- `missing`: baseline row has no snapshot assignment

Ignored and accepted-unresolved rows are excluded from numeric comparison and reported in baseline review counts.
