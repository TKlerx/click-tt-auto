# Tasks: Raster Import UX

**Branch**: `011-raster-import-ux` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Tests included (constitution II; spec has acceptance scenarios + measurable SCs). Paths repo-relative. `[P]` = parallelizable. Story labels map to spec user stories.

## Phase 1: Setup

- [ ] T001 Migration: add `RasterSource.inputSetId String?` FK → `RasterInputSet` with `onDelete: SetNull`, re-key uniqueness to `@@unique([inputSetId, sourceType, sourceRef])`, keep a `[scopeId, season]` index for the adoption query — in `webapp/prisma/schema.postgres.prisma` and a new `webapp/prisma/migrations-postgres/<timestamp>_source_workspace/migration.sql` (FR-009a, research R2). Additive, non-destructive; existing rows start with `inputSetId = null`.

## Phase 2: Foundational (blocking — ownership, workspace, context, roles)

*All four stories depend on these. No UI story can be correct until sources own by workspace and the page resolves the selected workspace.*

- [ ] T002 Source ownership in `webapp/src/services/raster/sources.ts`: `upsertRasterSource` sets `inputSetId` = the selected workspace; the page listing filters by `inputSetId` (not scope+season); add a legacy `inputSetId = null` query for adoption (FR-009a, S1, S6). Depends: T001.
- [ ] T003 [P] Workspace service in `webapp/src/services/raster/inputSets.ts`: list and create input sets for a (scope, season), with the name defaulting to scope + season (FR-005, FR-010a, FR-010b).
- [ ] T004 Legacy adoption: on the first workspace **selection** for a (scope, season) — created, auto-selected, or first manually chosen — adopt its `inputSetId = null` sources into the selected workspace; idempotent, so later selections are no-ops. MUST cover a scope+season that already has multiple input sets (no create/auto-select event), where selecting one adopts the legacy sources — otherwise they stay hidden by the workspace filter (FR-009b, research R3). Depends: T002, T003.
- [ ] T005 Page-context resolution in `webapp/src/app/(dashboard)/raster/import/page.tsx` (+ a small helper in `webapp/src/lib/raster/`): resolve `(scope, season, workspace)` with the workspace from `?workspace`, applying W1–W5 — none → prompt create, one → auto-select, many → selector, invalid/stale param or scope/season change → drop and re-apply (FR-007, FR-007a, FR-008, FR-008a). Depends: T003.
- [ ] T006 [P] Gate create-workspace and source add/parse/validate endpoints on `assertRasterAccess(user, scopeCode, "scheduler")`; `SCOPE_USER` is read-only, refused at the API not just hidden (FR-016, research R5).

## Phase 3: User Story 1 — Import sources in current context (P1)

**Goal**: add a click-TT URL or wish PDF without re-selecting scope; it saves to the visible scope+season+workspace.

**Independent test**: on a scope/season page with a selected workspace, add one URL and one PDF and confirm both are owned by the workspace with no repeated scope selection.

- [ ] T007 [P] [US1] Integration test `webapp/tests/integration/raster-source-workspace.test.ts` covering S1 (source saved with `inputSetId`), S2 (add disabled with no workspace), S6 (list filtered by workspace), S5 (`SCOPE_USER` source write → 403).
- [ ] T008 [US1] Add-source panel (click-TT URL + wish PDF) defaulting to current scope+season+selected workspace, with no scope picker and the season visible before submit (FR-001, FR-002, FR-003, FR-003a, FR-004, FR-009a). Depends: T002, T005.
- [ ] T009 [P] [US1] i18n keys for the add-source panel in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.

## Phase 4: User Story 2 — Work with one selected planning workspace (P1)

**Goal**: none → create-first; one → auto-selected; many → selector; all actions apply to the selected workspace.

**Independent test**: with zero/one/many workspaces, confirm create-first / auto-select / selector respectively, and that add/parse/review target the selected workspace.

- [ ] T010 [P] [US2] Unit test `webapp/tests/unit/raster/workspace-selection.test.ts` for W1–W5 (auto-select, selector, reset on scope/season change, stale param), plus integration C1/C2 (create workspace; the first adopts legacy sources) and the multi-workspace adoption case (a scope+season with legacy sources and several pre-existing input sets: selecting one adopts them; FR-009b).
- [ ] T011 [US2] Workspace selector + prominent create-first action near the page context, wired to the T005 resolution; source actions unavailable until a workspace is selected (FR-005, FR-006, FR-006a, FR-007, FR-007a, FR-008, FR-008a, FR-009). Depends: T003, T005.
- [ ] T012 [P] [US2] i18n keys for the workspace selector / create action in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.

**Checkpoint**: US1 + US2 are the MVP — context-aware source import against a selected workspace.

## Phase 5: User Story 3 — Complete the first import without hunting (P2)

**Goal**: primary add-source at the top; save registers only; Parse is the visible next action; parsed/unparsed are distinguished.

**Independent test**: add a source from the visible top area and confirm the saved source + Parse action are immediately visible without scrolling.

- [ ] T013 [P] [US3] Test `webapp/tests/integration/raster-source-parse-states.test.ts`: saved-but-unparsed is marked (FR-013), Parse is the prominent next action (FR-012b), parse shows a summary (FR-014), a parse failure keeps the source visible with a recoverable error (FR-015).
- [ ] T014 [US3] Restructure the import page: primary add-source area at the top (not a bottom advanced section), the newly saved source and its Parse next-action immediately visible, unparsed/parsed distinction + parsed summary, recoverable parse error (FR-011, FR-012, FR-012a, FR-012b, FR-013, FR-014, FR-015). Depends: T008.
- [ ] T015 [P] [US3] i18n keys for source states / parse actions in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.

## Phase 6: User Story 4 — Support alternate planning versions (P3)

**Goal**: create a second workspace deliberately and switch the active one.

**Independent test**: create a second workspace for the same scope+season, switch, and confirm source/validation/review context follows.

- [ ] T016 [P] [US4] Test `webapp/tests/integration/raster-workspace-switch.test.ts`: create a second workspace, switch, and confirm the source list follows the active workspace (FR-010, FR-017, US4 scenarios).
- [ ] T017 [US4] Create-additional-workspace action + switching that updates source/validation/review context, keeping the active workspace visible to prevent wrong-workspace edits (FR-010, FR-017). Depends: T011.

## Phase 7: Polish & Cross-Cutting

- [ ] T018 [P] Responsive layout + toast feedback pass on the import view; verify on a narrow viewport (constitution VIII, X).
- [ ] T019 [P] E2E `webapp/tests/e2e/raster-import-ux.spec.ts`: the US1–US3 primary journey (context → add → save → parse).
- [ ] T020 [P] Run `webapp` validate (typecheck, lint, `pnpm test`); update raster docs / `CONTINUE.md`.
- [ ] T021 Verify end-to-end the legacy-sources adoption and the `SCOPE_USER` read-only edge cases per [quickstart.md](./quickstart.md) (FR-009b, FR-016).

## Dependencies & order

- Setup migration (T001) → Foundational (T002–T006). T006 [P] alongside services.
- US1 (T007–T009) depends on ownership (T002) + context (T005).
- US2 (T010–T012) depends on the workspace service (T003) + context (T005).
- US3 (T013–T015) depends on the add-source panel (T008).
- US4 (T016–T017) depends on the selector (T011).
- Polish (T018–T021) last.

## Parallel examples

- Foundational: T003 and T006 in parallel with T002; T004/T005 after their deps.
- Each story's `[P]` i18n task runs alongside its implementation task.
- US1, US2 test tasks (T007, T010) can be written in parallel once Foundational lands.

## MVP

Setup + Foundational + US1 + US2 (all P1): scope/season page context, workspace selection, and sources owned by the selected workspace. US3 (save-then-parse polish) and US4 (alternate versions) layer on.
