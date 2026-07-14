# Phase 1 Contracts: Combined WTTV Planning

**Feature**: `006-combined-wttv-planning` | **Date**: 2026-07-14

Interfaces: two new routes, two new API endpoints, and a coverage contract consumed wherever runs and snapshots appear.

---

## Route contract

Feature 005 gives Raster four step segments keyed on one scope + season. These two are **not** steps — neither belongs to a single scope's workflow.

| Route | Purpose |
|---|---|
| `/raster/combined?season=<season>` | Choose scopes, see the gaps you are accepting, start a combined run (FR-010, FR-010a, FR-012a) |
| `/raster/readiness?season=<season>` | Cross-scope readiness overview (FR-001, FR-004, FR-005) |
| `/raster/runs?scope=&season=` | From 005. Gains the incomplete marking (FR-036) |
| `/raster/snapshots/<id>` | Gains scope narrowing (FR-022) and coverage display (FR-037) |

No `scope` parameter on the first two — that is the point of them. Scope selection is the page's content, not its address.

---

## API

### New: combined input sets and runs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/raster/combined` | `POST` | Create a combined input set from a chosen scope set + season (FR-011) |
| `/api/raster/combined/[id]/runs` | `POST` | Start a combined run (FR-012, FR-018) |

**`POST /api/raster/combined`** — body carries the season and the scope ids.

Rejects: fewer than two scopes (a single scope is the normal flow); any scope the caller cannot access (FR-015). Both enforced server-side regardless of what the picker offered.

**`POST /api/raster/combined/[id]/runs`** — starts the run and freezes the coverage record in the same transaction (FR-030, FR-038).

**Does not reject for incompleteness.** This is the feature's central inversion: the endpoint accepts gaps and records them. There is no `force` flag, because there is nothing to force past.

### New: cross-scope readiness

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/raster/readiness?season=` | `GET` | Per-scope completeness across accessible scopes (FR-001, FR-007) |

Returns only scopes the caller can access, and must not imply anything about the rest (FR-007) — an absent scope is absent, not complete.

### Unchanged

Single-scope input sets, runs, validation, capacity and source endpoints all keep their contracts. Combined runs reuse the existing run pipeline (FR-018) — they are not a parallel system.

---

## Coverage contract

Consumed by run lists, snapshot lists, and the snapshot view. One shape, two halves.

| Field | Type | Requirement |
|---|---|---|
| `complete` | boolean | FR-034. Queryable. True **only** when every scope was spanned **and** there were no gaps |
| `spannedScopes` | scope ids | FR-031 |
| `spannedAll` | boolean | FR-031. Whether that was every scope *at the time the run started* |
| `excludedGroups` | group ids | FR-032a |
| `wishGaps` | team ids + what was missing | FR-032b |
| `capacityGaps` | club/hall/weekday + missing or insufficient | FR-032c |

### Rules

- **`complete` is not `spannedAll`.** A run spanning every scope with gaps is incomplete. The likely bug is treating them as synonyms, because a full-scope run is what someone reaches for when testing.
- **A/B absence is not a gap** (FR-033). It never appears in `wishGaps`.
- **Frozen at start** (FR-038). Never recomputed. Coverage describes *then*; readiness describes *now*; they must not share a code path.
- **Single-scope runs carry it too** (FR-035). A Bezirk run with excluded groups is incomplete by the same rule. This is what settles feature 005's Q4 — scoping coverage to combined runs only would leave 005's partial runs unmarked, which is the hazard the mechanism exists to close.

### Presentation

| Where | Requirement |
|---|---|
| Run list, snapshot list | Incomplete distinguishable without opening (FR-036) |
| Run list, snapshot list | Combined distinguishable from single-scope without opening (FR-021) |
| Snapshot view | What was missing, not merely that something was (FR-037) |
| Combined snapshot | States which scopes it covers; never appears to belong to one (FR-020) |
| Before starting | Gaps shown, so incompleteness is chosen not stumbled into (FR-012a) |

**FR-021 and FR-036 are two markers, not one.** Incomplete answers "can this be trusted?"; combined answers "what is this a plan of?". A run spanning every scope with no gaps is complete *and* combined — it carries the second marker and not the first. Collapsing them loses the case where a fully-valid WTTV-wide plan sits in a list looking exactly like a Bezirk plan.

---

## Solver contract

**Unchanged.** A combined run assembles groups, teams, wishes and capacities across spanned scopes into the input the existing solver already accepts, and omits fixed upper-league Rasterzahlen unless an admin supplied them (FR-013, FR-014).

This is not a new solver capability. `003` settled it: "A full WTTV or district run may proceed with zero fixed numbers; the optimizer assigns schedule numbers subject to the available group, wish, and capacity inputs." Constitution Principle I is satisfied by reuse — the solver is invoked, not reimplemented.

An infeasible combined run must name the spanned scope whose constraints could not be satisfied (FR-019). The existing outcome model (`INFEASIBLE`, solver status) carries this; the scope attribution is new.
