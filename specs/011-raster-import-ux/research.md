# Phase 0 Research: Raster Import UX

The clarify sessions (2026-07-16, 2026-07-19) settled the product decisions. These resolve the technical unknowns behind them. No open `NEEDS CLARIFICATION`.

## R1 — "Planning workspace" is the existing `RasterInputSet`

**Decision**: Present `RasterInputSet` to users as a "planning workspace". It already has `name`, `scopeId`, `season`. No new entity, no rename of the model — a presentation/label change plus selection UX.

**Rationale**: The spec's Assumptions say input sets remain the underlying concept, seen as workspaces. Reusing the entity keeps the change small (constitution I) and leaves the run/model machinery untouched.

**Alternatives considered**: a new `Workspace` entity wrapping input sets — rejected, pure duplication.

## R2 — Sources gain an owner (the migration)

**Decision**: Add `inputSetId String?` to `RasterSource` (FK → `RasterInputSet`), and re-key source uniqueness from `(scopeId, season, sourceType, sourceRef)` to include the workspace for owned rows. Nullable so pre-feature rows are valid until adopted (R3); PostgreSQL's unique-null behavior means the migration also keeps legacy dedupe for unowned rows with a partial unique index.

**Rationale**: Today `RasterSource` is scope+season-keyed with no input-set link (verified in schema). FR-009a ("sources belong to the selected workspace") cannot hold without this. It is the first schema change across features 006–011, so it gets a real migration in `prisma/migrations-postgres/`.

**Alternatives considered**: a join table `RasterInputSetSource` — rejected, a source belongs to at most one workspace, so a nullable FK is simpler than a many-to-many.

## R3 — Legacy source adoption (FR-009b)

**Decision**: Adopt lazily, in the app, not via a migration backfill. On the first workspace **selection** for a (scope, season) — created, auto-selected, or first manually chosen from the selector — sources for that scope+season with `inputSetId = null` are assigned to the selected workspace. Once owned they are never re-adopted, so the second selection is a no-op.

**Rationale**: A blanket migration backfill would have to invent a workspace for every scope+season that has legacy sources. Triggering on *selection* covers all three arrival paths, including the case a create/auto-select trigger would miss: a scope+season that already has **multiple** input sets has no "first workspace" event, so keying on create/auto-select alone would leave its legacy sources orphaned and — because the page filters sources by `inputSetId` — invisible. Adopting into whichever workspace the user first actively uses is deterministic and idempotent.

**Alternatives considered**: adopt only on create/auto-select — rejected, it strands legacy sources for existing multi-workspace scope+seasons; a migration backfill picking an arbitrary workspace per scope+season — rejected as presumptuous; leave-shared hybrid — rejected in clarify.

## R4 — Selection tracked in the URL

**Decision**: The selected workspace is a URL query parameter (e.g. `?workspace=<id>`), read by the server component that renders the import page, exactly as scope and season already drive page context. Changing scope/season drops the param and re-applies the auto-select rule (FR-007a).

**Rationale**: The feature's premise is "context lives in the page". The URL makes it shareable, bookmarkable, and refresh-safe (FR-008a), and server components can resolve it without client round-trips.

**Alternatives considered**: server-side per-user session (hidden, unshareable) and client-only state (lost on refresh) — both rejected in clarify.

## R5 — Write access reuses feature 007

**Decision**: Create-workspace and source add/parse/validate endpoints call the existing `assertRasterAccess(user, scopeCode, "scheduler")`. `SCOPE_USER` gets a read-only page; the create/add controls are absent for them and refused at the API (FR-016).

**Rationale**: 007 just landed and defines exactly these levels; source-upload and run-start already gate on scheduler. Reuse, don't reinvent — and enforce at the API, not only the UI (007's own rule).

**Alternatives considered**: any-scope-access-can-write and platform-admin-only — both rejected in clarify.

## R6 — Save registers; parse is separate (FR-012a/b)

**Decision**: Saving a source upserts it (registered URL or uploaded PDF) via the existing `upsertRasterSource` without parsing; Parse is a separate action wired to the existing `refreshRasterSource`. The source list distinguishes saved-but-unparsed from parsed (FR-013) and shows a summary once parsed (FR-014).

**Rationale**: The clarify chose save-then-parse to fix the "why did saving do nothing?" confusion (SC-006). Both service functions already exist; this feature is wiring + UI states, not new parsing.

**Alternatives considered**: parse-on-save — rejected in clarify.

## R7 — Workspace delete orphans, doesn't cascade sources

**Decision**: The `RasterSource.inputSetId` FK uses `onDelete: SetNull`. Deleting a workspace orphans its sources (owner → null); they are then re-adoptable by the next workspace for that scope+season (R3).

**Rationale**: Sources are expensive to re-register/re-upload; cascading their deletion with a workspace risks real data loss. SetNull preserves them and reuses the adoption path.

**Alternatives considered**: `Cascade` (delete sources with the workspace) — rejected, data-loss risk; `Restrict` (block workspace delete while sources exist) — rejected, forces manual cleanup for a routine action.
