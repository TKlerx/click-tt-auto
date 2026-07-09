# Feature Specification: Deploy Smoke Verification

**Feature Branch**: `020-deploy-smoke-verification`  
**Created**: 2026-06-11  
**Status**: Draft  
**Input**: User description: "Add deployment smoke verification for Azure deployments so operators can prove the deployed app, health endpoint, migrations, worker readiness, and container app revision health after deployment."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Verify The Deployed Application (Priority: P1)

As an operator, I want one repeatable smoke check that confirms the deployed web application is reachable and healthy after deployment, so I can trust that users can access the release before I mark it successful.

**Why this priority**: A deployment is not useful if the user-facing application cannot be reached. This is the minimum viable safety check.

**Independent Test**: Run the smoke verification against a configured deployed environment and confirm it fails when the application endpoint is unavailable and passes when the endpoint returns a healthy result.

**Acceptance Scenarios**:

1. **Given** a deployed environment with a reachable application endpoint, **When** the operator runs smoke verification, **Then** the result reports the application endpoint as healthy.
2. **Given** a deployed environment with an unreachable or unhealthy application endpoint, **When** the operator runs smoke verification, **Then** the result fails with the checked endpoint and reason.

---

### User Story 2 - Verify Deployment Runtime State (Priority: P2)

As an operator, I want the same smoke process to confirm migration completion, worker readiness, and active container revision health, so deployment success reflects the complete runtime and not only the web endpoint.

**Why this priority**: A deployment can look healthy from the web endpoint while background processing, migrations, or active revisions are broken.

**Independent Test**: Run smoke verification with mocked or test Azure runtime responses and confirm it passes only when migration, worker, and revision states are all acceptable.

**Acceptance Scenarios**:

1. **Given** the latest migration completed successfully, the worker is ready, and active revisions are healthy, **When** smoke verification runs, **Then** the deployment runtime state passes.
2. **Given** any migration, worker, or active revision check fails, **When** smoke verification runs, **Then** the overall result fails and identifies the failed runtime check.

---

### User Story 3 - Preserve Operator Evidence (Priority: P3)

As an operator, I want a concise smoke report in local and CI output, so failures are easy to diagnose and successful deployments have auditable evidence.

**Why this priority**: Verification is more useful when the result can be shared, reviewed, and traced after the deployment finishes.

**Independent Test**: Run smoke verification in success and failure modes and confirm the generated output contains environment identity, checked targets, pass/fail statuses, and remediation-oriented failure details.

**Acceptance Scenarios**:

1. **Given** all checks pass, **When** smoke verification completes, **Then** the operator sees a concise success summary including environment, endpoint, and runtime checks.
2. **Given** one or more checks fail, **When** smoke verification completes, **Then** the operator sees a failure summary that names each failed check and preserves enough context for CI logs or local troubleshooting.

### Edge Cases

- The application is deployed under a non-root base path.
- The application endpoint returns a redirect, timeout, authentication challenge, or non-health response.
- Azure credentials are missing, expired, or lack access to the target resource group.
- A migration job has no recent execution for the deployed revision.
- Multiple active container revisions exist during rollout.
- The worker is intentionally scaled to zero but has a healthy latest revision.
- The operator runs the smoke check outside CI with manually supplied environment values.
- Secret values, connection strings, and tokens must never appear in smoke output.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a repeatable smoke verification entry point that operators can run locally or from deployment automation.
- **FR-002**: System MUST allow operators to select the target environment without editing source files.
- **FR-003**: System MUST verify the deployed application endpoint and report whether the expected health response is reachable within a bounded time.
- **FR-004**: System MUST support applications served under a configured base path when constructing the health check target.
- **FR-005**: System MUST verify that the latest relevant migration completed successfully before the deployment is considered healthy.
- **FR-006**: System MUST verify worker readiness using deployment/runtime state that does not require invoking user workloads.
- **FR-007**: System MUST verify active container application revision health for the deployed web application and worker.
- **FR-008**: System MUST fail the smoke verification when any required check fails.
- **FR-009**: System MUST produce a concise machine-readable result suitable for CI and a human-readable summary suitable for local use.
- **FR-010**: System MUST redact secrets and sensitive runtime values from all smoke output.
- **FR-011**: System MUST document how to run smoke verification after Azure deployment.
- **FR-012**: System MUST include automated tests for success, failure, timeout, missing-configuration, and redaction behavior.

### Key Entities

- **Smoke Target**: The selected deployment environment and resource identifiers needed to verify it.
- **Smoke Check**: One verification unit with a name, status, checked target, duration, and failure reason when applicable.
- **Smoke Report**: The complete result containing environment identity, check outcomes, timestamps, and sanitized diagnostic details.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Operators can run smoke verification for a configured environment with one command and receive a pass/fail result in under 2 minutes for normal healthy deployments.
- **SC-002**: 100% of failed required checks cause a non-success result and name the failed check.
- **SC-003**: Successful runs include at least the application endpoint, migration, worker, and revision checks in the final summary.
- **SC-004**: Smoke output contains zero raw secret values in automated redaction tests.
- **SC-005**: Deployment documentation lets a new operator run the smoke check without reading source code.

## Assumptions

- Azure deployment remains the target for this feature.
- The existing app health endpoint or an equivalent route can be used for the web reachability check.
- CI has access to the same Azure identity already used by deployment automation.
- Worker readiness can be inferred from Container App revision/runtime state rather than by pushing a real background job.
