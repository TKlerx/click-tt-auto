# Clarifications: Logging Standardization

## Session 2026-06-10

1. Default logging volume: Important operational events are enabled by default; request logs remain configurable and opt-in.
2. Console guardrail scope: Ad hoc console logging is disallowed in production app and worker source paths only.
3. Actor identifiers: Operational logs may include stable internal IDs by default and should avoid emails and display names unless explicitly justified as safe.
4. Request logging contents: When request logging is enabled, emit request completion logs with status and duration.
5. URL/query logging: Request logs include path only; query fields must be sanitized or explicitly allowlisted.
