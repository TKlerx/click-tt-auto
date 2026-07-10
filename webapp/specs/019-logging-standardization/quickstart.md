# Quickstart: Logging Standardization

## Implement

1. Extend `src/lib/logger.ts` to expose the agreed event shape and safe metadata helpers.
2. Update `src/proxy.ts` so request logging is opt-in and emits completion logs with status and duration.
3. Replace ad hoc production `console.error` calls in app services with structured logger calls.
4. Add worker structured logging parity for job lifecycle events.
5. Add or extend validation so production app/worker source rejects ad hoc console/direct output.
6. Document event naming, severity, context, and redaction rules.

## Verify Locally

Run targeted checks while implementing:

```powershell
pnpm vitest run tests/unit/logger.test.ts
pnpm vitest run tests/unit/proxy-request-logging.test.ts
pnpm vitest run tests/unit/token-service.test.ts tests/unit/notifications/notification-service.test.ts tests/unit/teams-service.test.ts tests/unit/audit.test.ts tests/unit/instrumentation.test.ts
pnpm vitest run tests/unit/logging-validation.test.ts
```

Run worker tests if they exist or are added:

```powershell
uv run pytest worker/tests
```

Run the project validation gate before completion:

```powershell
.\validate.ps1 all
```

## Manual Smoke Checks

With request logging disabled, normal app navigation should not emit request logs.

With request logging enabled, a request completion log should include:

- `event=http.request.completed`
- `requestId`
- `method`
- `path`
- `status`
- `durationMs`

The log must not include a full URL, raw query string, email address, display name, cookie, authorization header, token, or secret.
