# Phase 1 Contracts: Guided Raster Navigation

**Feature**: `005-raster-guided-navigation` | **Date**: 2026-07-14

The interfaces this feature exposes are **routes** (what a user can address) and a small number of **API changes**. The twelve services in `services/raster/` keep their contracts; this feature re-composes their callers.

---

## Route contract

Scope and season stay query parameters, as today. The step is a path segment so it is addressable (FR-004).

| Route | Step | Contents |
|---|---|---|
| `/raster?scope=<code>&season=<season>` | — | Redirects to the default step (FR-004a) |
| `/raster/import?scope=&season=` | Import data | Add/refresh/remove sources; create input set (FR-005) |
| `/raster/review?scope=&season=` | Review data | Matching review, group planning status, six-team mode, model warnings, capacity review, fixed schedule numbers (FR-006) |
| `/raster/run?scope=&season=` | Run optimizer | Validation, run settings, start run, run progress (FR-007) |
| `/raster/runs?scope=&season=` | Review optimization runs | Finished outcomes, snapshots, scenario comparison (FR-008) |
| `/raster/snapshots/<id>` | — | Unchanged. A destination reached from Review optimization runs, **not** a step |

### Route behaviour

- **Default step** (FR-004a, FR-004b): `/raster` resolves the first step in workflow order with outstanding work; falls through to `/raster/runs` when nothing is outstanding. Derived from current readiness, never from a remembered preference.
- **Preservation** (FR-003): changing step preserves `scope` and `season`. Changing scope or season preserves the step.
- **Free navigation** (FR-013): every step is reachable regardless of readiness. Readiness informs; it does not gate routing.
- **Empty states**: a step with nothing to act on renders its empty state, not an error (spec edge case: "a user opens a step address directly for a step that has no content yet").
- **Access** (FR-016): a scope the user cannot reach yields the existing not-authorized response, before any step content is loaded.
- **`scope` parameter**: carries the scope `code` (e.g. `OWL`, `WTTV`). Resolved to a `Scope` row and thence to `scopeId`. The current lookup matching on `code` **or** `name` is retired — code only.

### Backwards compatibility

`?district=` is **not** preserved. There is no production deployment and no data (FR-024), so no live bookmark breaks. The parameter is renamed to `scope` because "district" is the mistranslation this feature retires (FR-022a) and keeping it would preserve the confusion in the address bar.

---

## API changes

Most raster API routes are unchanged. Three areas move.

### Changed: scope in place of district

Every raster route currently taking a `district` query parameter or body field takes `scope` (a scope code) instead, and resolves it to a `scopeId`. Affected: sources, capacity, input-sets, scenarios listing endpoints.

**Contract**: `district` is removed rather than deprecated. No dual-accept period — no clients exist beyond this app.

### New: match review

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/raster/input-sets/[id]/match-review` | `POST` | Mark records reviewed. Body: record ids. Stores the current fingerprint per record (FR-009) |
| `/api/raster/input-sets/[id]/match-review` | `GET` | Per-record review state: settled, or outstanding with reason (never reviewed / content changed) (FR-010b) |

**Authorisation**: the `admin` level used by the existing group route today. Feature 007 revisits who may act; this feature does not widen it.

**Idempotence** (FR-010a): re-posting a review for an unchanged record is a no-op — same fingerprint, same state.

### Unchanged: group planning status

`/api/raster/input-sets/[id]/groups/[groupId]` **already** accepts `planningStatus: "include" | "exclude"` and delegates to `updateGroupPlanningStatus`. FR-006b needs no new endpoint — the capability exists and is merely buried in the run area. This feature relocates and surfaces it.

**One defect worth fixing in passing**: that route audits planning-status changes as `AuditAction.RASTER_INPUT_UPLOADED`, which is not what happened. Excluding a group is a planning decision and should be auditable as one — it is the difference between a complete and a partial Bezirk.

---

## UI contract: readiness

Consumed by the step nav (FR-011) and the default-step redirect (FR-004b) from one shared derivation (research R-007).

Per step:

| Field | Values | Requirement |
|---|---|---|
| `state` | `not-started` \| `outstanding` \| `ready` \| `blocked` | FR-011 |
| `outstanding` | what is unfinished, in user terms | FR-012 |
| `resolvedBy` | which earlier step resolves it | FR-012 |
| `hasExclusions` | boolean | FR-011a |

**`hasExclusions` is not decoration.** FR-011a forbids showing an unqualified ready state while any group is excluded, and FR-006e forbids presenting a scope as fully planned in that case. The naive shape — a four-value enum — cannot express "ready, but three groups are excluded", which is the single most likely thing to be lost in implementation. A Bezirk that is ready-with-exclusions is not ready.

### Blocked reasons

Existing gates, unchanged (FR-014), now surfaced in the nav rather than only at the button that refuses:

| Cause | Resolved by | Source |
|---|---|---|
| Validation not passed | Run optimizer | `RasterInputSet.status !== "READY"` |
| Gym capacities missing or below requirement | Review data | `blockingCount = missingCount + insufficientCount` |
| Six-team group without a mode | Review data | Season model `groups[].rasterMode` null |
| Matching review outstanding | Review data | `RasterMatchReview` fingerprint mismatch or absent |

Where the cause is a group's missing wishes, the stated options must include **excluding that group to proceed for now**, alongside supplying the data (FR-012a) — and excluding must read as deferral, not resolution (FR-006c).
