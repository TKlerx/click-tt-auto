# Phase 1 Data Model: Raster Import UX

One migration. The workspace is an existing entity; the only schema change is giving `RasterSource` an owner.

## Changed

### RasterSource (migration)

| Field | Change |
|---|---|
| `inputSetId` | **NEW** `String?` FK → `RasterInputSet(id)`, `onDelete: SetNull` (R7). Nullable: pre-feature rows are unowned until adopted (R3). |
| uniqueness | from `@@unique([scopeId, season, sourceType, sourceRef])` to workspace-scoped uniqueness for owned rows. Because PostgreSQL allows multiple `NULL` values in unique keys, the migration MUST preserve legacy dedupe for unowned rows with a partial unique index such as `(scopeId, season, sourceType, sourceRef) WHERE inputSetId IS NULL`, plus an index for the legacy/adoption query. |

Migration: additive column + FK + indexes; no destructive data change. `inputSetId` starts null for every existing row; adoption (R3) fills it lazily in the app.

## Reused as-is

### RasterInputSet — the "Planning Workspace"

Already has `id`, `name` (the user-visible workspace name, FR-010a), `scopeId`, `season`, `status`, `createdById`. No change. Presented in the UI as a workspace. Auto-select / selector / reset (FR-007/007a/008) operate over the set of input sets for the current (scope, season).

## Not persisted

### Selected workspace

A page-context value carried in the URL (`?workspace=<inputSetId>`, FR-008a), resolved server-side. Rules:

- none for (scope, season) → prompt to create the first (FR-006), source actions disabled (FR-006a)
- exactly one → auto-selected, param optional (FR-007)
- many → selector; param names the active one (FR-008)
- scope/season change → param dropped, rule re-applied (FR-007a)

## Ownership & lifecycle

- A source is created owned by the selected workspace (FR-009a): `upsertRasterSource` sets `inputSetId`.
- Legacy sources (`inputSetId = null`) for a (scope, season) are adopted by the **first** workspace created/auto-selected there (FR-009b).
- Listing sources for the page and refreshing input-set caches/validation filters by `inputSetId` (the selected workspace), not scope+season.
- Deleting a workspace sets its sources' `inputSetId` to null (re-adoptable), never deletes them (R7).

## Permissions (reused, feature 007)

Create-workspace and source write (add/parse/validate) require `assertRasterAccess(user, scopeCode, "scheduler")`; `SCOPE_USER` is read-only (FR-016). No new permission model.
