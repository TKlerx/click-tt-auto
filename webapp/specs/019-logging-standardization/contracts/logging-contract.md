# Operational Logging Contract

## Event Shape

Application and worker operational logs must serialize as one JSON object per line.

Required base fields:

- `timestamp`: ISO-8601 timestamp.
- `level`: `debug`, `info`, `warn`, or `error`.
- `event`: stable dotted event name.
- `component`: logical source component.

Allowed correlation fields:

- `requestId`
- `jobId`
- `jobType`
- `actorId`
- `operationId`

Allowed diagnostic fields:

- `status`
- `durationMs`
- `path`
- `query`
- `error`
- `metadata`

## Naming

- Use lower-case dotted event names: `observability.initialized`, `http.request.completed`, `job.claimed`, `job.completed`, `job.failed`.
- Do not encode dynamic values into event names.
- Keep event names stable after release.

## Privacy Rules

- Do not log raw emails, display names, cookies, authorization headers, bearer tokens, API keys, client secrets, session tokens, message bodies, or raw Graph payloads.
- Use stable internal IDs for users and actors.
- Redact sensitive keys recursively, including snake_case, kebab-case, camelCase, and case-insensitive variants.
- Truncate or summarize large/nested objects.

## Request Logs

Request logging is opt-in. When enabled, emit completion logs with:

- `event`: `http.request.completed`
- `requestId`
- `method`
- `path`
- `status`
- `durationMs`
- optional sanitized `query`

Do not log full URLs or raw query strings. Query fields must be allowlisted or omitted.

## Worker Logs

Worker job lifecycle logs must include:

- `event`: one of `worker.started`, `jobs.requeued_stale`, `job.claimed`, `job.completed`, `job.failed`, `teams.poll_scheduled`
- `component`: `worker`
- `jobId` when a job exists
- `jobType` when a job exists
- `attempt` for claim/failure paths
- safe result summaries rather than full payloads

## Audit Boundary

Operational logs are diagnostic output only. They must not replace or weaken audit records for security-relevant actions.
