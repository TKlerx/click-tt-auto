# Data Model: Logging Standardization

## Operational Log Event

Runtime-emitted JSON object for diagnostic logging.

| Field         | Type                                   | Required    | Notes                                                                             |
| ------------- | -------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `timestamp`   | ISO timestamp string                   | Yes         | Emitted by logger at write time.                                                  |
| `level`       | `debug` \| `info` \| `warn` \| `error` | Yes         | Filtered by configured log level.                                                 |
| `event`       | string                                 | Yes         | Stable dotted event name, e.g. `job.completed`.                                   |
| `message`     | string                                 | Optional    | Human-readable detail when different from `event`; must not carry sensitive data. |
| `component`   | string                                 | Yes         | Logical component such as `proxy`, `notifications`, `worker`.                     |
| `environment` | string                                 | Yes for app | Existing environment metadata.                                                    |
| `requestId`   | string                                 | Optional    | Correlates app work originating from an HTTP request.                             |
| `jobId`       | string                                 | Optional    | Correlates worker/background job work.                                            |
| `jobType`     | string                                 | Optional    | Safe job category.                                                                |
| `actorId`     | string                                 | Optional    | Stable internal ID only; not email/display name by default.                       |
| `status`      | string/number                          | Optional    | HTTP status, job status, or operation status.                                     |
| `durationMs`  | number                                 | Optional    | Completion duration in milliseconds.                                              |
| `path`        | string                                 | Optional    | Path only, without scheme/host/raw query.                                         |
| `query`       | object                                 | Optional    | Sanitized allowlisted query fields only.                                          |
| `error`       | object/string                          | Optional    | Sanitized error representation.                                                   |
| `metadata`    | object                                 | Optional    | Sanitized contextual values.                                                      |

### Validation Rules

- `event` uses lower-case dotted names and remains stable once published.
- Sensitive keys are redacted recursively, including normalized token/key variants.
- Nested data is depth-limited to prevent oversized logs.
- Unknown metadata is sanitized before serialization.
- Logging failures must not break the primary operation.

## Correlation Context

Transient context attached to logs to connect related work.

| Field       | Type   | Source                                           |
| ----------- | ------ | ------------------------------------------------ |
| `requestId` | string | Incoming `x-request-id` or generated request ID. |
| `jobId`     | string | Background job record ID.                        |
| `jobType`   | string | Background job type.                             |
| `component` | string | Logger child/base metadata.                      |

## Logging Convention

Documentation-level contract for expected events.

| Field             | Type     | Purpose                                       |
| ----------------- | -------- | --------------------------------------------- |
| `eventName`       | string   | Stable identifier for dashboards/searches.    |
| `level`           | enum     | Expected severity for normal/error paths.     |
| `requiredContext` | string[] | Context fields that must accompany the event. |
| `optionalContext` | string[] | Safe additional fields.                       |
| `privacyNotes`    | string   | Sensitive values that must not be logged.     |

## Validation Finding

Output concept for guardrail failures.

| Field         | Type   | Notes                                                   |
| ------------- | ------ | ------------------------------------------------------- |
| `path`        | string | File containing unsafe output.                          |
| `line`        | number | 1-based line number.                                    |
| `pattern`     | string | Matched output API.                                     |
| `remediation` | string | Use structured logger or document an allowed exception. |
