# Contract: Manual Baseline API

All routes reuse `requireRasterInputSet`. Viewer access is sufficient for reads; scheduler access is required for every mutation.

## `GET /api/raster/input-sets/{inputSetId}/baseline`

Returns the active baseline, recent version metadata, rows, status counts, and whether the caller can edit. This route never starts a crawl or writes data.

## `POST /api/raster/input-sets/{inputSetId}/baseline`

Starts and completes an authenticated live import for the input set scope/season.

Request body: `{}`.

Responses:

- `200`: completed baseline with status `REVIEW` or `READY`
- `409`: an import is already running for this input set
- `422`: crawl produced no trustworthy, context-valid rows; the attempted version is failed and the prior active baseline remains active
- `502`: click-TT authentication/navigation/import failure; response names the failing scope/group/step without secrets

Individual invalid rows return `200` in a `REVIEW` baseline so the scheduler can resolve them. Import failure never deactivates the prior active baseline.

## `PATCH /api/raster/input-sets/{inputSetId}/baseline/rows/{rowId}`

Request is exactly one decision:

```json
{ "decision": "map", "targetTeamId": "team-id" }
```

```json
{ "decision": "ignore" }
```

```json
{ "decision": "accept-unresolved" }
```

The row must belong to the active baseline and input set. Mapping validates the target against the current season model. Response includes the row and recalculated baseline status/counts.

## `POST /api/raster/input-sets/{inputSetId}/runs` change

Existing request gains:

```json
{ "baselineId": "optional-ready-baseline-id" }
```

The baseline must be `READY`, active or historical, and belong to the same input set. Omitting it preserves current behavior. The solver settings/payload do not contain baseline assignments.

## Snapshot read change

Existing snapshot reads include `baselineComparison` only when the originating run has a baseline:

```json
{
  "baselineId": "baseline-id",
  "counts": { "unchanged": 10, "changed": 2, "new": 1, "missing": 1 },
  "rows": [
    {
      "teamId": "team-id",
      "teamLabel": "Team",
      "baselineRasterzahl": 3,
      "resultRasterzahl": 4,
      "state": "changed"
    }
  ]
}
```
