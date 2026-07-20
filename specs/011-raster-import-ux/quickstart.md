# Quickstart: Raster Import UX

## Prerequisites

- A scope + season reachable in Raster (navigation sets page context).
- A scheduler account (PLATFORM_ADMIN, or SCOPE_ADMIN holding the scope) and a SCOPE_USER account for the read-only check.
- The migration applied (`RasterSource.inputSetId`).

## 1. First workspace + legacy adoption

1. As a scheduler, open Import data for a scope+season that has **legacy sources** (added before this feature) and **no workspace**.
2. Confirm: a prominent "create first workspace" action near the top; source add controls disabled (FR-006, FR-006a).
3. Create the workspace (name defaults to scope + season). Confirm the legacy sources now belong to it (FR-009b) and are listed.

## 2. Context in the page

1. On the import page, confirm scope and season are shown as page context, and the current season is visible near the add-source controls (FR-001, FR-004).
2. Add a click-TT URL and upload a wish PDF **without** re-selecting scope; confirm both save to the visible scope+season+workspace (FR-002, FR-003, US1).
3. Confirm no scope picker appears on the source forms (FR-003a).

## 3. Save-then-parse, no hunting

1. Add a source from the **top** add-source area (not a bottom advanced section, FR-011).
2. On save, confirm the new source and a prominent Parse action are immediately visible (FR-012, FR-012b) and the source is marked unparsed (FR-013).
3. Parse it; confirm a content summary (FR-014). Force a parse failure; confirm the source stays visible with a recoverable error (FR-015).

## 4. Selection & multiple workspaces

1. Confirm the selected workspace is in the URL (`?workspace=…`); refresh and confirm it persists (FR-008a). Share the URL → same workspace.
2. Create a second workspace (US4); confirm a selector appears (FR-008) and switching it changes which sources are shown (FR-009, S6).
3. Change scope or season; confirm the selection resets and the auto-select rule re-applies (FR-007a).

## 5. Permissions

1. As a SCOPE_USER, open the page: read-only — sources visible, no create/add/parse (FR-016). Confirm the API refuses a direct write (403).

## Automated

```
pnpm --dir webapp exec vitest run tests/integration/raster-source-workspace.test.ts
pnpm --dir webapp run test:e2e   # raster-import-ux journey
```
