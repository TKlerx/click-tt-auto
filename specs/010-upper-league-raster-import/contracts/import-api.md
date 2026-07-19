# Contract: Upper-league raster import API + injection

## Import endpoint

Reuses the existing raster source upload surface (`webapp/src/app/api/raster/sources/upload/route.ts`), extended to accept the Gruppen-und-Raster PDF.

```
POST /api/raster/sources/upload   (multipart: file, scope, season, sourceType=UPPER_LEAGUE_RASTER)
```

| # | Given | Then |
|---|---|---|
| I1 | an admin with scheduler access to the scope + a valid PDF | parse, store a `RasterSource(UPPER_LEAGUE_RASTER)` row for (scope, season), return the parsed preview (FR-010, FR-011, FR-013) |
| I2 | a re-import for a scope+season that already has one | replace the existing row, bump `updatedAt` (FR-012) |
| I3 | a PDF the parser rejects | 4xx with the reason; no row written (FR-007) |
| I4 | a user without scheduler access to the scope | 403 (reuses `assertRasterAccess`) |

Auth: same access rule as other raster source uploads — scheduler level on the target scope (post-007, `SCOPE_ADMIN` or `PLATFORM_ADMIN` with scope access).

## Injection contract (run build)

New service `webapp/src/services/raster/upperLeague.ts`, called when a Bezirk run's season model is built (`services/raster/inputSets.ts`).

```
buildUpperLeagueInjection(scopeId, season, model): {
  teams: InjectedUpperLeagueTeam[]        // added to model.teams
  coverage: coverage.upperLeague          // matched / unmatched / excludedNoHall / importPresent
}
```

| # | Given | Then |
|---|---|---|
| J1 | an import exists; a scope club has a Verbandsliga team with a wish (hall known) | inject it fixed + capacity-relevant, group + size from the import, hall from the wish (FR-020, FR-022, FR-023) |
| J2 | a matched team with no wish (no hall/home day) | do NOT inject as capacity-relevant; record in `excludedNoHall` (FR-024) — never silently capacity-irrelevant |
| J3 | a parsed entry whose club has no exact scope-club match | omit from injection (FR-021); exact matching alone does not classify it as an in-scope gap |
| J4 | a scope club/team expected from wish data has no exact published match | record in `unmatched`; no fuzzy match (FR-011a, US3) |
| J5 | no import for the season | `importPresent: false`, inject nothing, run proceeds (FR-026) |
| J6 | any injected team | it never appears as an assignment in the snapshot (FR-025, SC-005) |

## Test anchors

- `tests/integration/upper-league-injection.test.ts` — J1–J6.
- `tests/unit/upper-league-capacity.test.ts` (PR #22) — the fixed team consumes hall capacity; the solver plans the Bezirk team clear of it (SC-001).
- `tests/unit/raster-runs-route.test.ts` / coverage tests — coverage record carries the upper-league facts.
