# Research: Logging Standardization

## Decision 1: Extend existing structured logger

**Decision**: Keep `src/lib/logger.ts` as the application logging entry point and extend it with explicit event/context conventions.

**Rationale**: The app already emits JSON logs, supports log levels, child metadata, request ID creation, and recursive redaction. Replacing it would add migration cost without solving the clarified requirements.

**Alternatives considered**:

- Add a third-party logger: rejected because the constitution requires minimal dependencies and the existing logger already covers the core behavior.
- Use raw `console.*` consistently: rejected because it does not enforce structure, redaction, or contract compliance.

## Decision 2: Request logging is opt-in completion logging

**Decision**: Request operational logs should be disabled unless explicitly enabled. When enabled, emit request completion with status and duration, not a default request-start log.

**Rationale**: Completion logs provide more diagnostic value and align with the clarified requirement to keep default volume low.

**Alternatives considered**:

- Keep current default request-start logging: rejected because it conflicts with the clarified opt-in requirement and misses status/duration.
- Log both start and completion by default: rejected because it doubles volume for limited value in this app scale.

## Decision 3: Privacy-first metadata policy

**Decision**: Operational logs may include stable internal IDs, event names, components, request/job IDs, status, duration, sanitized paths, and allowlisted query fields. They must not include raw emails, display names, bearer tokens, cookies, full URLs, arbitrary query strings, message bodies, or secret-like fields.

**Rationale**: The project already stores audit data separately. Operational logs should support diagnosis without becoming a secondary sensitive data store.

**Alternatives considered**:

- Allow emails/display names for debugging: rejected because the clarified requirement says stable internal IDs by default.
- Log full URLs and redact known keys afterward: rejected because allowlisting is safer than denylisting arbitrary query parameters.

## Decision 4: Python worker parity via stdlib JSON formatting

**Decision**: Add or refactor a small worker logging helper using Python stdlib logging/json to match the shared contract.

**Rationale**: The worker currently logs formatted strings. A lightweight helper provides structured job lifecycle events without adding dependencies.

**Alternatives considered**:

- Add a Python structured logging package: rejected as unnecessary for the current scope.
- Leave worker logs as strings: rejected because User Story 2 requires parity and safe metadata.

## Decision 5: Guardrails through validation

**Decision**: Add validation that scans production app and worker source paths for ad hoc `console.*`/unsafe output, while allowing scripts, tests, and the logger implementation itself.

**Rationale**: The clarified scope is production app/worker paths only. A focused guard avoids false positives in CLI tooling while blocking regressions where they matter.

**Alternatives considered**:

- Ban `console.*` globally: rejected because scripts and validation tooling legitimately use console output.
- Rely on review only: rejected because the spec requires automated validation.
