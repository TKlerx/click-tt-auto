# Feature Specification: Logging Standardization

**Feature Branch**: `019-logging-standardization`  
**Created**: 2026-06-10  
**Status**: Draft  
**Input**: User description: "Standardize general logging across the template using the existing structured logger. Replace ad hoc console error calls, define event naming and safe metadata conventions, add consistent request/job/component context, and document expected app and worker logging behavior without introducing a new logging platform."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## Clarifications

### Session 2026-06-10

- Q: What should the default logging volume be? → A: Important operational events by default; request logs remain configurable/opt-in.
- Q: Where should ad hoc console logging be disallowed? → A: Production app and worker source paths only.
- Q: Which actor identifiers may operational logs include by default? → A: Stable internal IDs; avoid emails and display names by default.
- Q: What should request logs contain when request logging is enabled? → A: Request completion with status and duration.
- Q: How should request URLs and query strings be logged? → A: Log paths and only sanitized or allowlisted query fields.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Consistent Application Logs (Priority: P1)

As an operator investigating an app issue, I want every important application failure to appear as structured, redacted, searchable log events so I can correlate symptoms without reading source code or guessing which console format a subsystem used.

**Why this priority**: This is the core operational value. The template already has structured request and process logging, but remaining ad hoc error logs reduce consistency and can weaken redaction guarantees.

**Independent Test**: Can be tested by triggering representative app-side failures and confirming emitted log entries have a consistent shape, event name, component context, request correlation when available, and no raw secrets.

**Acceptance Scenarios**:

1. **Given** a recoverable application operation fails, **When** the failure is logged, **Then** the log entry uses the standard structured format with a stable event name, severity, component, and safe context.
2. **Given** a request-scoped operation logs an event, **When** a request correlation value exists, **Then** the log entry includes that correlation value.
3. **Given** log metadata includes sensitive-looking fields, **When** the event is emitted, **Then** secrets, tokens, credentials, and cookies are redacted.
4. **Given** actor context is available, **When** an operational log includes actor context, **Then** the log uses stable internal identifiers by default and avoids emails or display names unless explicitly justified as safe.
5. **Given** request logging is enabled, **When** a request completes, **Then** the request log includes completion outcome and elapsed duration.
6. **Given** request logs include routing context, **When** the request has query parameters, **Then** the log includes the path and only sanitized or allowlisted query fields.

---

### User Story 2 - Worker Log Parity (Priority: P2)

As an operator comparing app and worker behavior, I want worker logs to use the same event naming and metadata conventions as app logs so background job failures can be diagnosed with the same operational playbook.

**Why this priority**: Background jobs are a major operational surface. Logging parity prevents the worker from becoming a separate troubleshooting island.

**Independent Test**: Can be tested by running worker job success and failure paths and verifying that worker logs use the shared conventions for event names, severity, job identity, attempt count, and safe metadata.

**Acceptance Scenarios**:

1. **Given** a worker job starts, completes, or fails, **When** the worker logs the event, **Then** the log entry includes job identity, event name, component, and severity.
2. **Given** a worker failure includes exception details, **When** the log is emitted, **Then** the error summary is useful while sensitive payload fields remain redacted.

---

### User Story 3 - Logging Guidance And Guardrails (Priority: P3)

As a developer using the template, I want clear logging conventions and regression checks so new features follow the same logging approach without adding one-off console output or leaking sensitive values.

**Why this priority**: Documentation and checks keep the template consistent after the initial cleanup.

**Independent Test**: Can be tested by reviewing the logging guidance and running validation that flags or prevents newly introduced ad hoc logging in production code.

**Acceptance Scenarios**:

1. **Given** a developer needs to log a new operational event, **When** they read the logging guidance, **Then** they can identify the correct event naming pattern, severity, component field, and safe metadata expectations.
2. **Given** production app or worker source code introduces a new ad hoc console log, **When** validation runs, **Then** the issue is reported with enough context to replace it with the standard logging approach.

### Edge Cases

- Logging must remain safe when metadata contains nested objects, arrays, error objects, or unknown third-party response shapes.
- Logging must not break the primary user action if log emission itself fails.
- Request correlation may be unavailable for startup, scheduled, worker, or CLI-originated work; those events still need stable component and operation context.
- High-volume request logging must remain configurable and disabled unless explicitly enabled so local development and production deployments can reduce noise.
- Raw full URLs and raw query strings must not be logged because they may contain tokens, callback codes, emails, search text, or sensitive filters.
- Audit records and operational logs serve different purposes; this feature must not replace audit trail requirements for security-sensitive business actions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST emit operational logs in a consistent structured shape across application request handling, background services, and worker execution.
- **FR-002**: System MUST use stable event names that identify the domain and outcome of the operation, such as an area, action, and result.
- **FR-003**: System MUST include component context on operational log entries so operators can identify the subsystem that emitted the event.
- **FR-004**: System MUST include request correlation context on request-scoped log entries whenever that context is available.
- **FR-005**: System MUST include job or background operation context on worker and queued-operation log entries whenever that context is available.
- **FR-006**: System MUST redact sensitive metadata fields before log output, including credentials, tokens, cookies, authorization values, and common casing or separator variants of those fields.
- **FR-006a**: System MUST use stable internal actor identifiers by default and avoid logging emails or display names unless a specific safe-use case is documented.
- **FR-007**: System MUST replace ad hoc console logging in production app and worker source paths with the standard logging approach.
- **FR-008**: System MUST preserve existing process-level failure logging and request correlation behavior while replacing default request-start logs with opt-in request completion logs.
- **FR-009**: System MUST document logging severity guidance, event naming rules, required context fields, redaction expectations, and examples for app and worker code.
- **FR-010**: System MUST provide regression coverage or validation that detects newly introduced ad hoc console logging in production app and worker source paths where a standard operational log should be used.
- **FR-011**: System MUST keep operational logging separate from audit trail persistence; audit-required user and security actions must continue to create audit records.
- **FR-012**: System MUST log important operational events by default while keeping request start/completion logging configurable and opt-in.
- **FR-013**: System MUST emit request completion logs with proxy-visible response status and elapsed proxy handling duration when request logging is enabled; downstream route handler status requires route-level logging if it is not visible at the proxy boundary.
- **FR-014**: System MUST log request paths without raw full URLs and MUST include query fields only when those fields are sanitized or explicitly allowlisted.

### Key Entities

- **Operational Log Event**: A structured diagnostic event emitted by the application or worker. Key attributes include timestamp, severity, event name, component, correlation context, and sanitized metadata.
- **Correlation Context**: Values that help connect logs across a request, job, or background operation. This may include request identity, job identity, internal actor identity, or operation identity when available.
- **Logging Convention**: The documented rules for event naming, severity selection, required context, and safe metadata.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of existing ad hoc console operational logs in production app and worker source paths are replaced or explicitly justified as non-production/debug-only output.
- **SC-002**: At least 90% of request-scoped important operational events emitted by touched code include a request correlation value when one is available.
- **SC-003**: Worker job start, completion, and failure paths emit logs that include job identity and a stable event name.
- **SC-004**: Redaction tests cover at least 10 sensitive key variants across nested metadata and confirm no raw secret value is emitted.
- **SC-005**: Developer-facing logging guidance includes at least one app request example, one background job example, and one redaction example.
- **SC-006**: Validation or tests fail when a new ad hoc console call is introduced in covered production app or worker source paths.
- **SC-007**: Actor-context logging tests confirm that internal actor identifiers may be emitted while email and display-name fields are omitted or redacted by default.
- **SC-008**: When request logging is enabled in a representative request flow, completion logs include status and duration fields for at least 95% of completed requests.
- **SC-009**: Request logging tests confirm raw full URLs and sensitive query parameter values are not emitted, while safe allowlisted query fields can be logged.

## Assumptions

- The feature standardizes the template's existing logging foundation instead of introducing a new hosted observability service.
- Existing audit trail behavior remains the source of truth for business/security audit events.
- Important operational events are logged by default; request start/completion logs remain configurable and opt-in to control volume.
- Worker logs should be compatible in shape and terminology with app logs even if the worker runtime uses a different language.
