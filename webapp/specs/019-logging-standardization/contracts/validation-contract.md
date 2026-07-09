# Logging Validation Contract

## Scope

Automated validation scans production application and worker source paths:

- `src/app`
- `src/lib`
- `src/services`
- `src/proxy.ts`
- `src/instrumentation.ts`
- `worker/src/starter_worker`

Validation excludes:

- tests
- scripts and CLI tooling
- generated files
- `src/lib/logger.ts`, where console writes are the logging sink
- Python `__pycache__` and build artifacts

## Disallowed Patterns

Production app paths must not use ad hoc:

- `console.log`
- `console.info`
- `console.warn`
- `console.error`
- `console.debug`

Worker paths must not use unsafe direct output such as:

- `print(...)`
- unstructured job lifecycle logging that interpolates payload/result values into message strings

## Required Remediation

Replace disallowed output with the structured logger for the runtime:

- TypeScript app: `logger.child({ component }).info|warn|error(event, meta)`
- Python worker: structured JSON worker logger helper

Any exception must be documented in code and reflected in validation allowlist tests.

## Acceptance Tests

Validation must fail when a production app/service file contains direct `console.error`.

Validation must pass for:

- console calls inside the logger implementation
- console calls in scripts
- console mocks/spies in tests
- Python stdlib logger calls that emit structured JSON through the worker helper
