# Data Model: Raster Generation & Review Webapp

Prisma models added to `webapp/prisma/schema.prisma` (+ `schema.postgres.prisma`). Users, Role, and Audit come from the existing baseline and are referenced, not redefined. Review entities carry a district key for district-scale views, while shared source material is attached to the hierarchy scope where it is valid (FR-008b/008c/025).

## Scope

Existing baseline scope, extended for raster hierarchy. Initial hierarchy: `DE` → `WTTV` → `OWL`.

| Field    | Type          | Notes                                                   |
| -------- | ------------- | ------------------------------------------------------- |
| id       | string (cuid) | PK                                                      |
| code     | string        | Unique key, e.g. `DE`, `WTTV`, `OWL`                    |
| name     | string        | Unique display name                                     |
| parentId | string?       | FK → Scope; null for root                               |

Relations: parent/children, user assignments, audit entries, raster sources.

Access rule: a user assigned to a parent scope can access child district data according to their role. Child access does not grant sibling access.

## RasterSource

A registered document/link/cache used to build input sets. It belongs to the scope where the source is valid, not necessarily the target district.

| Field       | Type          | Notes                                                             |
| ----------- | ------------- | ----------------------------------------------------------------- |
| id          | string (cuid) | PK                                                                |
| scopeId     | string        | FK → Scope                                                        |
| sourceType  | string        | e.g. `GROUP_ASSIGNMENT`, `WISHES_PDF`, `FIXED_RASTERZAHL`         |
| sourceRef   | string        | URL, file id, or stable source identifier                         |
| displayName | string        | User-facing label                                                 |
| contentHash | string?       | Optional replacement/change detection                             |
| parsedJson  | string?       | Parsed cache; updated only on explicit refresh/upload             |
| createdAt   | datetime      |                                                                   |
| updatedAt   | datetime      |                                                                   |

Uniqueness: (scopeId, sourceType, sourceRef). District flows list sources from the district scope and ancestors.

## InputSet

A named collection of inputs used for one generation run.

| Field           | Type                  | Notes                                                                                                |
| --------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| id              | string (cuid)         | PK                                                                                                   |
| name            | string                | User-facing label                                                                                    |
| district        | string                | Scope key (indexed)                                                                                  |
| createdById     | string                | FK → User                                                                                            |
| createdAt       | datetime              |                                                                                                      |
| status          | enum(`draft`,`ready`) | `ready` = validated, runnable (FR-008)                                                               |
| seasonModelJson | string?               | Validated structured season model (`clubs`, `teams`, `groups` including reviewed `rasterMode`, relational wishes) used by the solver |
| groupAssignmentJson | string?          | Cached parsed group assignment source used for the input set; refreshed only on explicit source refresh/upload |
| wishesJson      | string?               | Cached parsed/uploaded wishes source used for the input set; refreshed only on explicit source refresh/upload |

Relations: has many Wish, HallCapacity, FixedRasterzahl; has many OptimizationRun.

Group rows inside `seasonModelJson` include `size` and optional `rasterMode` (`single` or `double`). Six-team groups must be reviewed so that `rasterMode: "double"` selects the official 6er Doppelrunde table; missing mode blocks validation.

## Wish

A club's scheduling preference/constraint. Produced by deterministic PDF parse, pasted JSON, or structured upload.

| Field               | Type                                         | Notes                                 |
| ------------------- | -------------------------------------------- | ------------------------------------- |
| id                  | string                                       | PK                                    |
| inputSetId          | string                                       | FK → InputSet                         |
| clubId              | string                                       | Club identifier (from parser)         |
| clubName            | string                                       |                                       |
| teamLabel           | string?                                      | e.g. "Erwachsene II"                  |
| homeWeekday         | enum(weekday)                                |                                       |
| hall                | string?                                      | "1".."3"                              |
| startTime           | string?                                      | "19:30"                               |
| spielwochePref      | enum(`A`,`B`)?                               |                                       |
| requestedRasterzahl | int[]?                                       | Free-text-derived requests            |
| notes               | string?                                      | Besondere Wünsche                     |
| source              | enum(`pdf-parsed`,`llm-pasted`,`structured`) | Provenance                            |
| confidence          | enum(`ok`,`review`)                          | `review` ⇒ needs human check (FR-003) |

## HallCapacity

Reviewed/inferred/missing max parallel home matches for one club/hall/weekday. Persists across snapshots (FR-014).

| Field       | Type                                  | Notes                                    |
| ----------- | ------------------------------------- | ---------------------------------------- |
| id          | string                                | PK                                       |
| district    | string                                | Indexed                                  |
| clubId      | string                                | Indexed (search, FR-006)                 |
| hall        | string                                |                                          |
| weekday     | enum(weekday)                         |                                          |
| capacity    | int                                   | Value in effect                          |
| basis       | enum(`reviewed`,`inferred`,`missing`) | Distinguish reviewed vs guessed (FR-005) |
| updatedById | string?                               | FK → User                                |
| updatedAt   | datetime                              | Last-write-wins; audited                 |

Uniqueness: (district, clubId, hall, weekday).

## FixedRasterzahl

Immovable upper-league Rasterzahl — a hard constraint on generation (FR-007).

| Field      | Type                              | Notes         |
| ---------- | --------------------------------- | ------------- |
| id         | string                            | PK            |
| inputSetId | string                            | FK → InputSet |
| clubId     | string                            |               |
| teamLabel  | string                            |               |
| rasterzahl | int                               | Fixed value   |
| source     | enum(`pdf`,`manual`,`structured`) |               |

## OptimizationRun

A requested calculation from an InputSet.

| Field                  | Type                                                                 | Notes                                                            |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| id                     | string                                                               | PK                                                               |
| inputSetId             | string                                                               | FK → InputSet                                                    |
| startedById            | string                                                               | FK → User (admin)                                                |
| jobId                  | string?                                                              | FK → background job                                              |
| status                 | enum(`pending`,`running`,`succeeded`,`failed`,`cancelled`)           | FR-010                                                           |
| outcome                | enum(`proven_optimal`,`feasible`,`infeasible`,`failed`,`cancelled`)? | FR-011                                                           |
| objectiveValue         | float?                                                               |                                                                  |
| objectiveBreakdown     | json?                                                                | Penalty components, including ST4 same-club derby fallback count |
| solverStatus           | string?                                                              | Raw CP-SAT status                                                |
| settings               | json                                                                 | Run limits/parameters                                            |
| createdAt / finishedAt | datetime                                                             |                                                                  |

Relation: has one Snapshot (on success).

## Snapshot

A saved review version of one run (generated or imported). Versioned (FR-014).

| Field                                                    | Type                                                   | Notes                                                              |
| -------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| id                                                       | string                                                 | PK                                                                 |
| runId                                                    | string?                                                | FK → OptimizationRun (null if imported, FR-030)                    |
| district                                                 | string                                                 | Indexed                                                            |
| origin                                                   | enum(`generated`,`imported`)                           |                                                                    |
| optimality                                               | enum(`proven_optimal`,`feasible`,`imported_heuristic`) | Distinguished in UI (FR-013)                                       |
| stale                                                    | boolean                                                | Set true when inputs/capacity change (FR-022)                      |
| totalConflicts / totalExcess / maxExcess / affectedClubs | int/float                                              | Overview metrics (FR-015)                                          |
| objectiveBreakdown                                       | json                                                   | Penalty components shown in overview, including `sameClubDerbySt4` |
| createdAt                                                | datetime                                               |                                                                    |

Relations: has many Assignment, Conflict, ReviewDecision.

## Assignment

A team-to-Rasterzahl result with context (FR-019/021).

| Field                                     | Type                                         | Notes  |
| ----------------------------------------- | -------------------------------------------- | ------ |
| id                                        | string                                       | PK     |
| snapshotId                                | string                                       | FK     |
| league / group / clubId / clubName / team | string                                       |        |
| rasterzahl                                | int                                          |        |
| status                                    | enum(`optimized`,`fixed`,`pinned`,`missing`) | FR-021 |
| weekday                                   | enum(weekday)                                |        |
| hall                                      | string                                       |        |
| startTime                                 | string?                                      |        |
| weekSlot                                  | enum(`A`,`B`)?                               |        |

Indexes: (snapshotId, clubId), (snapshotId, league, group).

## Conflict

A hall-capacity overage (FR-017).

| Field             | Type          | Notes                  |
| ----------------- | ------------- | ---------------------- |
| id                | string        | PK                     |
| snapshotId        | string        | FK                     |
| matchWeek         | int           |                        |
| clubId / clubName | string        |                        |
| weekday           | enum(weekday) |                        |
| hall              | string        |                        |
| capacity          | int           |                        |
| actualCount       | int           | Home matches that slot |
| excess            | int           | actualCount − capacity |
| teams             | string[]      | Involved teams         |

Indexes: (snapshotId, clubId), (snapshotId, excess).

## ReviewDecision

User-entered status for a conflict or club summary (FR-023).

| Field       | Type                                                       | Notes                 |
| ----------- | ---------------------------------------------------------- | --------------------- |
| id          | string                                                     | PK                    |
| snapshotId  | string                                                     | FK                    |
| targetType  | enum(`conflict`,`club-summary`)                            |                       |
| targetId    | string                                                     | Conflict id or clubId |
| status      | enum(`reviewed`,`needs_correction`,`accepted_unavoidable`) |                       |
| note        | string?                                                    |                       |
| decidedById | string                                                     | FK → User             |
| decidedAt   | datetime                                                   |                       |

## Audit (existing baseline)

Reused for input uploads, run starts, capacity edits, and review-status changes (FR-030): actor, action, target, timestamp.

## State Transitions

```
InputSet: draft --validate(FR-008)--> ready --startRun--> (run created)
OptimizationRun: pending -> running -> succeeded | failed | cancelled
  succeeded + (proven_optimal|feasible) -> creates Snapshot
Snapshot: fresh --(capacity/input edit, FR-022)--> stale --(new run/import)--> superseded
HallCapacity: missing|inferred --review--> reviewed  (last-write-wins, audited)
```

</content>
