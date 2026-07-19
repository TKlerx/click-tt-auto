# Quickstart: Upper-League Raster Import

How to exercise the feature end to end once implemented.

## Prerequisites

- A Bezirk scope + season with an input set (scraped group assignments) and wishes covering the clubs' WTTV-level teams.
- The published PDF: `tests/fixtures/raster/gruppen-und-raster-2026.pdf` (committed), or the live file from nrw-tischtennis.de.

## 1. Parser (unit, no app)

```
pnpm --dir webapp exec vitest run tests/unit/groups-pdf.test.ts
```

The (now un-skipped) contract test parses the fixture and checks every `data/upper-fixed.csv` row is reproduced. This is the SC-002 gate.

## 2. Import (webapp)

1. Sign in as a scheduler for the Bezirk.
2. On the Raster import view, upload the Gruppen-und-Raster PDF for the season.
3. Confirm the parsed preview lists the leagues and Rasterzahlen, and shows which of *this Bezirk's* clubs matched and which scope wish/team rows still have no exact published match (US2, US3).
4. Re-upload a corrected PDF → the previous import is replaced (FR-012).

## 3. Constrained run

1. Start a Bezirk run for a club that has both a Verbandsliga 1st team (in the import, with a wish) and a Bezirksliga 2nd team sharing one hall.
2. Verify in the snapshot:
   - the 2nd team is not placed at home in the same week/time as the 1st team's fixed slot (SC-001);
   - the upper-league team does not appear as an assignment (SC-005);
   - the run's coverage record lists the matched upper-league team, any unmatched scope wish/team rows, and any excluded-for-no-hall teams.
3. Start a run for a club with no upper-league team → its plan is unchanged from before this feature (SC-006).

## 4. Failure-safe

- Upload a malformed PDF → import is refused with a reason, nothing stored (FR-007, SC-007).
- Start a run for a season with no import → it proceeds, and the coverage record notes the upper-league numbers were absent (FR-026, SC-004).

## Automated

```
pnpm --dir webapp exec vitest run tests/unit/groups-pdf.test.ts tests/unit/upper-league-capacity.test.ts tests/integration/upper-league-injection.test.ts
pnpm --dir webapp run test:e2e   # import UI happy path
```
