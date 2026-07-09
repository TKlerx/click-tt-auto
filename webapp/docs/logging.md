# Logging

Operational logs are diagnostic JSON lines emitted to process output. They help operators search failures and correlate work, but they are not the audit trail. Security-relevant user and admin actions still need persisted audit records.

## Event Shape

App logs use `src/lib/logger.ts`. Worker logs use `worker/src/starter_worker/logging.py`.

Every operational log should include:

- `timestamp`
- `level`
- `event`
- `component`

Use lower-case dotted event names such as `http.request.completed`, `tokens.last_used_update_failed`, `job.completed`, and `process.uncaught_exception`. Do not put IDs or other dynamic values in the event name.

## Severity

- `debug`: local or temporary diagnostic detail.
- `info`: expected operational state changes such as startup, request completion when enabled, or job completion.
- `warn`: recoverable abnormal conditions such as stale job requeue.
- `error`: failed operations that require investigation or were safely degraded.

## Safe Metadata

Prefer stable internal IDs:

- `requestId`
- `actorId`
- `jobId`
- `jobType`
- `operationId`
- entity IDs such as `notificationId` or `teamsOutboundMessageId`

Avoid raw emails, display names, cookies, authorization headers, bearer tokens, API keys, client secrets, session tokens, message bodies, full provider payloads, full URLs, and raw query strings. The logger redacts common sensitive key variants, but callers should still avoid passing sensitive metadata when a stable ID is enough.

Request-scoped service logs should include `requestId` when the caller has one available. Some queued/background helper calls are not request-scoped; in those cases use `actorId`, job IDs, entity IDs, or component context instead.

## Request Logging

Request logging is opt-in through `ENABLE_REQUEST_LOGGING=true`, `1`, or `yes`. When enabled, middleware emits `http.request.completed` with proxy-visible status and proxy handling duration:

```ts
proxyLogger.info("http.request.completed", {
  requestId,
  method: request.method,
  path: "/login",
  query: { page: "1" },
  status: 200,
  durationMs: 4,
});
```

Only paths are logged. Query fields are omitted unless explicitly allowlisted and sanitized.

## App Failure Example

```ts
const tokenLogger = logger.child({ component: "tokens" });

tokenLogger.error("tokens.last_used_update_failed", {
  error,
  tokenId,
});
```

Use the specific component name and event name. Include stable IDs and safe state only.

## Worker Job Example

```py
worker_logger.info(
    "job.completed",
    jobId=job.id,
    jobType=job.job_type,
    status="completed",
    result=safe_summary,
)
```

Worker lifecycle logs should include `jobId`, `jobType`, and `attempt` when a job exists. Use summarized results instead of full payloads.

## Redaction Example

```ts
logger.info("example.redaction", {
  actorId: "user_123",
  access_token: "secret",
  recipientEmail: "person@example.com",
});
```

The emitted log keeps `actorId` and replaces `access_token` and `recipientEmail` with `[REDACTED]`.

## Guardrails

Production app and worker paths must not add ad hoc console/direct output. Run:

```powershell
pnpm run logging:guard
```

The guard scans production app and worker source only. Scripts, tests, and logger sink implementations remain allowed to use console or stdlib logging directly.
