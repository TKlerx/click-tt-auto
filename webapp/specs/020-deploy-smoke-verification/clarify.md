# Clarifications: Deploy Smoke Verification

## Session 2026-06-11

1. Scope: Verification targets Azure deployments only.
2. Health endpoint: Use the existing deployed app health endpoint and support configured base paths.
3. Runtime checks: Treat migration, app revision, and worker revision checks as required and fail closed.
4. Worker readiness: Infer readiness from Container App revision/runtime state rather than enqueueing a real background job.
5. Evidence: Produce sanitized human output by default and JSON output on request for CI/tooling.
