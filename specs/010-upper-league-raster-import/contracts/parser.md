# Contract: Gruppen-und-Raster PDF parser

Module: `src/raster/ingest/groups-pdf.ts` (rewrite). Exposed to the webapp via `webapp/src/lib/raster/pipeline.ts`.

## Interface

```
parseUpperLeagueRasterPdf(filePath: string): Promise<ParsedUpperLeagueImport>
```

- Reads the PDF via `extractPdfText`.
- Returns `ParsedUpperLeagueImport` (see data-model.md).
- **Throws** on a document whose structure cannot be read (FR-007) — never returns best-effort/guessed numbers.

## Behaviour (verifiable)

| # | Given | Then |
|---|---|---|
| P1 | a league heading followed by `<n>  <team>  <day>. <time> Uhr` entries | each entry yields `{ rasterzahl: n, team, homeWeekday, startTime }` (FR-001, FR-002, FR-004) |
| P2 | a vacant slot `xxx` at number `k` | no entry for `k`; entries `k+1…` keep their own numbers (FR-005) |
| P3 | a team name containing digits ("1. FC Köln II", "Jugend 70 Merfeld") | the in-name digits are not read as `rasterzahl` (FR-006) |
| P4 | `data/upper-fixed.csv` | every row is reproduced (league, team, rasterzahl) exactly (FR-008, SC-002) |
| P5 | a document with no recognizable league/entry structure | throws (FR-007) |
| P6 | a league block | `size` = count of non-vacant entries (used as the group raster size, R3) |

## Test anchors

- `tests/unit/groups-pdf.test.ts` — the existing skipped contract test (`describe.skip`) is un-skipped and must pass P1–P6 against `tests/fixtures/raster/gruppen-und-raster-2026.pdf` using `data/upper-fixed.csv` as oracle.
