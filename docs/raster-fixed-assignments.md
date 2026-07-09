# Fixed Rasterzahl Assignments

Use this file as the stable schema for upper-league or externally fixed Rasterzahlen.
For example, convert `Gruppen-und-Raster-2026.pdf` into this CSV/JSON by hand or with an LLM, then pass the result with `--fixed`.
The app intentionally does not depend on the PDF layout.

## CSV

```csv
league,group,division,team,rasterzahl
NRW-Liga,Gruppe 1,Erwachsene,TTC Example,7
Oberliga,,Damen,SV Example II,12
Verbandsliga,Gruppe 1,Jungen 19,TTC Example,4
```

## JSON

```json
[
  {
    "league": "NRW-Liga",
    "group": "Gruppe 1",
    "division": "Erwachsene",
    "team": "TTC Example",
    "rasterzahl": 7
  }
]
```

## Columns

- `team`: required, exact team name.
- `rasterzahl`: required, fixed Rasterzahl.
- `league`: optional, used for the strictest match.
- `group`: optional, used when available.
- `division`: optional, e.g. `Erwachsene`, `Damen`, `Jungen 19`, `Mädchen 15`.

Matching order:

1. `league + group + division + team`
2. `group + division + team`
3. unique `team` when `league`, `group`, and `division` are blank

Run:

```powershell
pnpm raster -- ingest --from-clicktt --fixed data/upper-fixed.csv --out reports/raster/model.json --current reports/raster/current.json
```
