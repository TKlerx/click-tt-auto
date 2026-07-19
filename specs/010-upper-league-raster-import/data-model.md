# Phase 1 Data Model: Upper-League Raster Import

No database migration. The only persisted entity is an existing table (`RasterSource`) with a new `sourceType` value; everything else is in-memory shape (the parsed JSON, the injected teams, the coverage additions).

## Persisted

### RasterSource (existing — reused)

One row per importing scope + season for the published PDF.

| Field | Value for this feature |
|---|---|
| `scopeId` | the Bezirk that imported the PDF |
| `season` | e.g. `2026/27` |
| `sourceType` | **`UPPER_LEAGUE_RASTER`** (new value; column is free text, no migration) |
| `sourceRef` | uploaded file name / storage ref |
| `parsedJson` | the `ParsedUpperLeagueImport` below |
| `updatedAt` | bumped on re-import; drives `sourceChangedSinceStart` staleness (FR-012) |

Uniqueness: at most one `UPPER_LEAGUE_RASTER` row per (`scopeId`, `season`) — re-import replaces (FR-012).

## In-memory shapes

### ParsedUpperLeagueImport (the `parsedJson`)

Output of the parser (R1); the reviewed data a run reads instead of re-parsing (FR-011).

```
ParsedUpperLeagueImport {
  sourceLabel: string            // e.g. "Gruppen-und-Raster-2026.pdf"
  leagues: League[]
}
League {
  league: string                 // "Verbandsliga 1 Erwachsene"
  size: number                   // count of non-vacant entries → group raster size
  entries: Entry[]
}
Entry {
  rasterzahl: number             // leading number (FR-002)
  team: string                   // club/team display name
  homeWeekday?: string           // from "Sa."/"So."/… when present (FR-004)
  startTime?: string             // "17.30" → normalized (FR-004)
}
```

Validation: `rasterzahl` is 1..size; a vacant (`xxx`) slot advances the number but adds no entry (FR-005); digits inside a team name are never read as `rasterzahl` (FR-006); a document that does not yield at least one well-formed league is rejected (FR-007).

### Injected upper-league team (added to the season model at run build)

Produced by matching parsed entries to the scope's clubs (R2, R6). Shaped like a normal model team so the solver treats it uniformly, plus two markers.

```
InjectedUpperLeagueTeam {
  id, clubId, label            // identity from the matched scope club/team
  group: { league, name, size } // the upper-league group (from the import)
  rasterzahl: { kind: "fixed", value }   // FR-022 — hard constraint
  hall, homeWeekday, startTime  // hall from the club's wish/venue; day/time from the import
  planned: false                // FR-025 — input only, excluded from the snapshot
  capacityRelevant: true        // only when a hall was resolved (else the team is excluded, not injected)
}
```

State/transitions: an entry is **matched** (exact club name in scope) or **unmatched** (recorded, US3). A matched team is **injected** (hall resolved → capacity-relevant) or **excluded** (no hall/home day → recorded, FR-024, never silently capacity-irrelevant).

### Coverage record additions (feature 006 record — extended)

Per run, alongside the existing gap fields (R7):

```
coverage.upperLeague {
  importPresent: boolean          // false → recorded, run still proceeds (FR-026)
  matched: Array<{ clubId, label, rasterzahl }>
  unmatched: Array<{ league, team }>        // parsed but no scope club (US3)
  excludedNoHall: Array<{ clubId, label }>  // matched but no hall/home day (FR-024)
}
```

## Relationships

- `RasterSource(UPPER_LEAGUE_RASTER)` → parsed once per (scope, season); read at run build.
- Injected teams are derived per run from (this scope's clubs) × (the parsed import); they are not persisted except as their effect on the snapshot's assignments/conflicts and the coverage record.
- No relationship to `RasterFixedRasterzahl` — that manual path is untouched and independent (spec Assumptions).
