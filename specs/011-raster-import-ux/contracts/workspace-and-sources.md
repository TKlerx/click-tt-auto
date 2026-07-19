# Contract: Workspace selection + source ownership

## Page context resolution (server)

The import page resolves `(scope, season, workspace)` from navigation + URL. `workspace` is `?workspace=<inputSetId>`.

| # | Given (for current scope+season) | Then |
|---|---|---|
| W1 | no workspace | show a prominent create-first-workspace action; source add controls disabled (FR-006, FR-006a) |
| W2 | exactly one workspace | auto-select it; `?workspace` optional (FR-007) |
| W3 | multiple workspaces | render a selector near the context; `?workspace` names the active one (FR-008) |
| W4 | `?workspace` set to an id not in this scope+season (e.g. after a scope/season change) | ignore it and re-apply W1–W3 (FR-007a) |
| W5 | scope or season changed | drop `?workspace`, re-apply W1–W3 (FR-007a) |

## Create workspace

```
POST /api/raster/input-sets   (scope, season, name)
```

| # | Given | Then |
|---|---|---|
| C1 | scheduler on the scope + a name | create the input set; if it is the first for (scope, season), adopt legacy null-owner sources into it (FR-006, FR-009b, FR-010a) |
| C2 | name omitted | default to scope + season (FR-010b) |
| C3 | `SCOPE_USER` (no scheduler) | 403 (FR-016) |

## Source add / parse (default to selected workspace)

Existing source write endpoints, extended to own by workspace and gate on 007.

| # | Given | Then |
|---|---|---|
| S1 | a selected workspace + a click-TT URL or wish PDF | save the source with `inputSetId` = the selected workspace, without parsing (FR-009a, FR-012a) |
| S2 | no workspace selected | the add action is unavailable/refused (FR-006a) |
| S3 | a saved unparsed source | Parse is the prominent next action; the list marks it unparsed (FR-012b, FR-013) |
| S4 | Parse invoked | run the existing parse (`refreshRasterSource`); on success show a content summary (FR-014); on failure keep the source visible with a recoverable error (FR-015) |
| S5 | `SCOPE_USER` | read-only: sees sources, no add/parse (FR-016) |
| S6 | listing the page's sources | filter by the selected `inputSetId`, not scope+season |

## Test anchors

- `webapp/tests/integration/raster-source-workspace.test.ts` — C1–C3, S1–S6, legacy adoption.
- `webapp/tests/unit/…` — W1–W5 auto-select/reset logic.
- `webapp/tests/e2e/raster-import-ux.spec.ts` — the US1–US3 journey.
