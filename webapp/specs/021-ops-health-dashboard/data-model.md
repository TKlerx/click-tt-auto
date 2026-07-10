# Data Model: Ops Health Dashboard

The first version uses in-memory view models assembled from existing runtime metadata, health checks, and available recorded operational evidence. No new database tables are planned.

## EnvironmentIdentity

Identifies the running environment and build.

| Field         | Type                 | Required | Notes                                                                |
| ------------- | -------------------- | -------- | -------------------------------------------------------------------- |
| `environment` | string               | yes      | `local`, `development`, `staging`, `production`, or configured value |
| `version`     | string               | yes      | Runtime version label; fallback allowed for local development        |
| `revision`    | string               | no       | Commit SHA or revision identifier                                    |
| `buildId`     | string               | no       | CI/run/build identifier                                              |
| `builtAt`     | ISO timestamp string | no       | Build timestamp if provided                                          |

Validation rules:

- Missing optional values render as `unknown` or `unavailable`.
- Values must be treated as identifiers only; they must not include secrets.

## HealthCheckResult

Represents one operational health area.

| Field       | Type                         | Required | Notes                                                           |
| ----------- | ---------------------------- | -------- | --------------------------------------------------------------- |
| `key`       | enum string                  | yes      | `runtime`, `database`, `configuration`, `worker`, `deploySmoke` |
| `label`     | translation key              | yes      | Localized in UI                                                 |
| `status`    | enum string                  | yes      | `healthy`, `degraded`, `unknown`, `unavailable`                 |
| `summary`   | translation key or safe text | yes      | Short human-readable status                                     |
| `detail`    | translation key or safe text | no       | Safe next-step detail                                           |
| `checkedAt` | ISO timestamp string         | no       | Present when evaluated or recorded                              |

Validation rules:

- `degraded` must include safe detail that points to an investigation area.
- `unknown` and `unavailable` must not cause the whole dashboard to fail by themselves.
- Raw secret/config values are never valid in `summary` or `detail`.

## HealthSnapshot

Point-in-time administrator view of the environment.

| Field               | Type                 | Required | Notes                                 |
| ------------------- | -------------------- | -------- | ------------------------------------- |
| `capturedAt`        | ISO timestamp string | yes      | Time this snapshot was assembled      |
| `overallStatus`     | enum string          | yes      | Worst meaningful status across checks |
| `environment`       | EnvironmentIdentity  | yes      | Current runtime identity              |
| `checks`            | HealthCheckResult[]  | yes      | Ordered health areas                  |
| `diagnosticSummary` | DiagnosticSummary    | yes      | Copy-safe summary                     |

Overall status rules:

1. Any `degraded` required check makes overall status `degraded`.
2. If no required check is degraded and at least one required check is unknown, overall status is `unknown`.
3. Optional worker/deploy smoke unknown/unavailable states do not degrade the overall status.
4. Otherwise the overall status is `healthy`.

## DiagnosticSummary

Copyable non-secret representation of the snapshot.

| Field         | Type                 | Required | Notes                                            |
| ------------- | -------------------- | -------- | ------------------------------------------------ |
| `text`        | string               | yes      | Multi-line plain text suitable for issue reports |
| `generatedAt` | ISO timestamp string | yes      | Usually same as `capturedAt`                     |

Allowed content:

- Environment name
- Version, revision, build id, built-at timestamp
- Snapshot timestamp
- Overall status
- Health check keys and statuses
- Safe short summaries

Forbidden content:

- Tokens, passwords, API keys, private keys
- Full connection strings
- Raw environment variable values except approved build metadata
- Request cookies, session IDs, auth headers

## Recorded Operational Evidence

Existing data that may inform optional worker and deploy smoke checks.

Potential sources:

- Existing background job records for worker evidence
- Existing deployment smoke output if the application records it in a safe, queryable place

Rules:

- If no recent safe record exists, show `unknown` or `unavailable`.
- The dashboard must not execute deploy smoke tests.
- Any payload/result/error content read from records must be sanitized before display or copying.
