# API Contract: Raster Run Comparison

Base path: `/api/raster`

## List scenarios

`GET /scenarios?district=&season=&inputSetId=`

Returns comparable optimizer/manual scenarios for one scope.

Response:

```json
{
  "scenarios": [
    {
      "id": "run_123",
      "inputSetId": "set_123",
      "district": "OWL",
      "season": "2026/27",
      "name": "CP-SAT 10 min",
      "origin": "optimizer",
      "strategy": "cp_sat",
      "status": "feasible",
      "settings": { "timeLimitSeconds": 600 },
      "kpiSummary": {
        "objective": 1234,
        "totalHallExcess": 8,
        "maxHallExcess": 2,
        "affectedClubs": 5,
        "wishMisses": 3,
        "sameClubDerbyIssues": 0,
        "status": "feasible"
      },
      "detailRef": "/raster/scenarios/run_123",
      "stale": false,
      "createdAt": "2026-07-12T10:00:00.000Z",
      "finishedAt": "2026-07-12T10:06:00.000Z"
    }
  ]
}
```

## Start optimizer strategy

`POST /input-sets/{inputSetId}/runs`

Extends the existing run-start route with an explicit `strategy`.

Request:

```json
{
  "strategy": "cp_sat",
  "name": "CP-SAT 10 min",
  "timeLimitSeconds": 600
}
```

Allowed strategies: `initial_heuristic`, `cp_sat`.

Response:

```json
{ "runId": "run_123", "scenarioId": "run_123", "status": "queued" }
```

## Create manual draft

`POST /input-sets/{inputSetId}/manual-assignments`

Request:

```json
{
  "name": "Colleague draft",
  "rows": [
    { "groupName": "1. Bezirksliga Herren", "teamName": "ABC 1", "scheduleNumber": 4 }
  ]
}
```

Response:

```json
{ "draftId": "manual_123", "validationIssues": [] }
```

## Validate manual draft

`POST /manual-assignments/{draftId}/validate`

Response:

```json
{
  "valid": false,
  "issues": [
    { "groupName": "1. Bezirksliga Herren", "teamName": "ABC 1", "message": "Duplicate schedule number 4 in group" }
  ]
}
```

## Score manual draft

`POST /manual-assignments/{draftId}/score`

Creates a manual scenario only when validation passes.

Response:

```json
{ "scenarioId": "manual_123", "status": "completed" }
```

## Compare scenarios

`POST /scenarios/compare`

Request:

```json
{
  "scenarioIds": ["run_123", "manual_123"],
  "baselineScenarioId": "manual_123"
}
```

Response includes selected scenarios plus KPI deltas against the baseline. The server rejects scenarios from different
districts, seasons, input sets, or incompatible input versions.
