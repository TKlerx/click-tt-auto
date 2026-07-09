# Research: Deploy Smoke Verification

## Decision: Use a TypeScript smoke command in `scripts/`

**Rationale**: The repository already uses Node scripts for validation and automation. TypeScript keeps parsing, redaction, and report typing testable with Vitest while avoiding a new dependency or shell-only implementation.

**Alternatives considered**:

- PowerShell script: familiar locally on Windows, but less natural in GitHub Ubuntu runners and harder to unit test in this repo.
- Bash-only workflow block: simplest for CI, but not reusable locally and harder to validate without Azure.
- New CLI package: unnecessary for the current scope.

## Decision: Use Azure CLI as the Azure interaction layer

**Rationale**: The deployment workflow already authenticates with Azure CLI and uses it for Container App and Job operations. Reusing `az` avoids adding SDK packages and keeps local operator prerequisites aligned with the existing quickstart.

**Alternatives considered**:

- Azure SDK packages: more structured but adds dependencies and authentication surface.
- OpenTofu outputs only: useful for names, but insufficient for live revision and job state.

## Decision: Check the existing app health endpoint

**Rationale**: `/api/health` already reports app and database health. The Azure output `app_endpoint` includes the configured base path, so the smoke command can append `api/health` safely.

**Alternatives considered**:

- Root page smoke: proves only rendering/reachability, not database health.
- New health endpoint: unnecessary unless the existing endpoint proves insufficient.

## Decision: Treat runtime checks as fail-closed required checks

**Rationale**: Operators need a deployment result they can trust. If migration, worker readiness, or active revision health is unknown or failed, the smoke command should fail.

**Alternatives considered**:

- Advisory warnings: easier rollout, but weakens the deployment gate.
- Endpoint-only MVP in CI: misses known deployment failure modes.

## Decision: Redact output with centralized sensitive-value filtering

**Rationale**: Smoke reports may include command output and URLs. A central sanitizer lets tests prove token, secret, password, key, and connection-string shaped data is not printed.

**Alternatives considered**:

- Trust Azure CLI query selection: helpful but incomplete for errors.
- No machine-readable output: less risk, but loses CI evidence.
