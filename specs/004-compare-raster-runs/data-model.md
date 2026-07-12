# Data Model: Raster Run Comparison

## Scenario

A comparable scheduling result or attempted result for one district, season, and input set.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Existing run/snapshot id or new manual scenario id |
| inputSetId | string | Required compatibility boundary |
| district | string | Copied from input set/snapshot |
| season | string | Copied from input set/snapshot |
| name | string | User-visible label |
| origin | enum(`optimizer`,`manual`) | Source category |
| strategy | enum(`initial_heuristic`,`cp_sat`,`manual`) | Comparison label |
| status | enum(`queued`,`running`,`completed`,`feasible`,`failed`,`cancelled`,`no_solution`) | Honest user-visible state |
| settings | json | Time budget, solver options, import source label |
| kpiSummary | json? | Present only for valid scored scenarios |
| detailRef | string? | Route/link to assignments and conflicts |
| stale | boolean | True when input/scoring assumptions changed |
| createdAt | datetime | |
| finishedAt | datetime? | |

Validation:
- Scenarios are comparable only when `district`, `season`, and `inputSetId` match.
- Failed/cancelled/no-solution scenarios remain in history but are not selected by default for KPI comparison.

## KPI Summary

Shared scoring output for optimizer and manual scenarios.

| Field | Type | Notes |
|-------|------|-------|
| objective | number | Existing objective score |
| totalHallExcess | number | Sum of excesses |
| maxHallExcess | number | Worst single excess |
| affectedClubs | number | Count of clubs with excess/conflicts |
| wishMisses | number | Existing wish miss count |
| sameClubDerbyIssues | number | Existing derby issue count |
| status | string | Solver/manual status label |

Validation:
- Computed by shared scoring code, not user-entered.
- Missing for scenarios without a valid assignment.

## Manual Assignment Draft

Editable user-provided schedule-number assignment before scoring.

| Field | Type | Notes |
|-------|------|-------|
| id | string | |
| inputSetId | string | |
| name | string | Source/display name |
| rows | json | Group/team/schedule-number rows |
| validationIssues | json | Current blocking issues |
| createdById | string | |
| createdAt | datetime | |
| updatedAt | datetime | |

Validation:
- Every required team must have one legal schedule number unless its group is explicitly excluded.
- Schedule numbers must be unique within a group.
- Unknown group/team rows stay visible for correction and block scoring.

## Manual Assignment Row

Logical row inside a manual draft.

| Field | Type | Notes |
|-------|------|-------|
| groupId | string? | Matched group |
| groupName | string | Source/display group name |
| teamId | string? | Matched team |
| teamName | string | Source/display team name |
| scheduleNumber | number? | Candidate schedule number |
| sourceLine | string? | Raw import row for audit/correction |
| issues | string[] | Row-level validation messages |

## Scenario Comparison

Transient UI selection, optionally persisted later if users ask for saved comparison sets.

| Field | Type | Notes |
|-------|------|-------|
| scenarioIds | string[] | Two or more compatible scenarios |
| baselineScenarioId | string? | Used for deltas |

State transitions:

```text
ManualAssignmentDraft -> validate failed -> editable draft
ManualAssignmentDraft -> validate passed -> scored Scenario(origin=manual)

Optimizer run -> queued/running -> completed/feasible Scenario(origin=optimizer)
Optimizer run -> failed/cancelled/no_solution -> history-only Scenario
```
