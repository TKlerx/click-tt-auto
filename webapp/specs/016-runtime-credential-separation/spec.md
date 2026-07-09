# Feature Specification: Runtime Credential Separation

**Feature Branch**: `016-runtime-credential-separation`
**Created**: 2026-05-27
**Status**: Draft
**Input**: User description: "Add a smaller version of rag-agent runtime least privilege for this template: separate app, worker, migration/provisioning, and local-development credentials where practical."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Identify Runtime Credential Ownership (Priority: P1)

An operator can review each runtime setting and understand whether it belongs to the public app, background worker, migration/provisioning flow, or local development.

**Why this priority**: The template currently uses a shared environment block for multiple runtimes. Before changing credentials, the team needs a clear ownership map to avoid breaking Docker and local development.

**Independent Test**: Review the runtime credential contract and confirm every high-risk setting in `.env.example`, `.env.docker.example`, `docker-compose.yml`, app database config, and worker config is classified with an owner and intended scope.

**Acceptance Scenarios**:

1. **Given** a deployment operator is preparing environment values, **When** they review the credential contract, **Then** they can tell which values are required by app, worker, migration/provisioning, and local-development contexts.
2. **Given** a setting is shared today, **When** the contract is reviewed, **Then** the target split or accepted exception is visible.
3. **Given** a local-only convenience value exists, **When** production-style settings are reviewed, **Then** it is clearly excluded from hosted or Docker production defaults.

---

### User Story 2 - Split Database Credentials By Runtime (Priority: P1)

An operator can configure separate runtime database URLs for the app, worker, and migration/provisioning paths so the public app does not need migration-level or worker-specific database authority.

**Why this priority**: Database access is the main shared privilege in the current starter and is the cleanest first runtime boundary to enforce.

**Independent Test**: Run production-style Compose using separate app, worker, and migration database URL variables, then confirm app startup, migrations, seed, and worker polling all still function.

**Acceptance Scenarios**:

1. **Given** separate app, worker, and migration database URLs are configured, **When** Docker Compose starts, **Then** migrations use the migration URL, the app uses the app URL, and the worker uses the worker URL.
2. **Given** only the legacy `DATABASE_URL` exists in local development, **When** local app or worker startup runs, **Then** the local fallback still works with a clear development-only interpretation.
3. **Given** production-style Compose receives only a SQLite file URL or missing database URL, **When** services start, **Then** they fail fast with a clear error.

---

### User Story 3 - Separate Integration Secrets By Runtime (Priority: P2)

An operator can keep app-facing sign-in secrets separate from worker-only background integration secrets where the template already has different responsibilities.

**Why this priority**: Microsoft Graph mail and Teams credentials are more sensitive when passed to every runtime. The starter should make the intended split visible without over-engineering tenant-specific deployments.

**Independent Test**: Inspect the Compose and env examples to confirm app, worker, and migration services receive only the integration values they need, with documented exceptions for shared Graph app registrations.

**Acceptance Scenarios**:

1. **Given** SSO is configured for the app, **When** the worker runtime starts, **Then** it does not require interactive sign-in secrets unless a documented worker flow needs them.
2. **Given** mail or Teams background polling is enabled, **When** the app runtime starts, **Then** worker-only polling credentials are not required for normal app requests.
3. **Given** a smaller deployment intentionally reuses one app registration, **When** the exception is documented, **Then** operators can still see which runtime receives the shared values and why.

---

### User Story 4 - Prevent Credential Drift (Priority: P3)

An operator can run a lightweight validation check that catches obvious wrong-runtime secrets before production-style deployment.

**Why this priority**: Separation only stays useful if future template changes do not silently add privileged values back into every runtime.

**Independent Test**: Run the validation flow against a good example and a deliberately bad example where a migration database URL or worker-only secret is exposed to the app runtime.

**Acceptance Scenarios**:

1. **Given** a forbidden app-runtime setting is introduced, **When** validation runs, **Then** it reports the setting and the expected runtime owner.
2. **Given** a documented exception is present, **When** validation runs, **Then** it accepts the exception only when owner, rationale, and review date are recorded.
3. **Given** the credential contract changes, **When** validation runs, **Then** docs and examples remain consistent with the accepted runtime owners.

### Edge Cases

- A small deployment intentionally uses the same database role for app and worker until separate roles are provisioned.
- Local development keeps `DATABASE_URL=file:./dev.db` for convenience and should not require multiple SQLite URLs.
- Docker Compose interpolation may require compatibility variables while services transition to runtime-specific names.
- Graph credentials may be intentionally shared between SSO, mail, and Teams in small tenants, but this must be visible as an exception rather than hidden in a shared env block.
- Migration and seed flows may require broader database privileges than either app or worker runtime.
- A downstream app may not use mail or Teams at all and should be able to leave related worker-only values blank.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST document runtime ownership for all high-risk environment values used by the app, worker, migration/provisioning, and local-development contexts.
- **FR-002**: The system MUST define separate database URL settings for app runtime, worker runtime, and migration/provisioning flow.
- **FR-003**: The system MUST preserve `DATABASE_URL` as a local-development fallback while discouraging it as the only production-style credential.
- **FR-004**: Production-style app startup MUST use the app database URL when provided and MUST NOT require migration-only database credentials.
- **FR-005**: Production-style worker startup MUST use the worker database URL when provided and MUST NOT require app-only session or SSO credentials unless a worker feature explicitly needs them.
- **FR-006**: Migration and seed flow MUST use the migration/provisioning database URL when provided.
- **FR-007**: Docker Compose examples MUST show separate app, worker, and migration database URLs with clear fallback and failure behavior.
- **FR-008**: Integration secrets for SSO, Graph mail, and Teams MUST be classified by runtime owner and documented exceptions where values are intentionally shared.
- **FR-009**: The app, worker, and migration services MUST fail clearly in production-style startup when their required runtime credential is missing or unsafe.
- **FR-010**: Validation MUST detect obvious wrong-runtime exposure, including migration database URLs in app runtime and worker-only secrets in app runtime unless documented as exceptions.
- **FR-011**: Validation MUST require documented exceptions to include owner, rationale, and review date.
- **FR-012**: Existing local development, Docker Compose, authentication, background jobs, mail, Teams, and seed flows MUST continue to work after credential separation.
- **FR-013**: Documentation MUST state that this feature reduces future blast radius and does not imply a current compromise or emergency secret rotation.

### Key Entities _(include if feature involves data)_

- **Runtime Credential**: A database URL, client secret, token, password, or configuration value that grants access to another system.
- **App Runtime**: The Next.js web process serving user-facing pages and API routes.
- **Worker Runtime**: The Python background worker that polls jobs and performs asynchronous mail or Teams work.
- **Migration/Provisioning Runtime**: The migration and seed execution context that prepares database schema and initial data.
- **Local Development Context**: Developer workstation flow that can use SQLite and simplified values without defining every production credential separately.
- **Credential Exception**: A documented reason why a setting is intentionally shared across runtimes, including owner, rationale, and review date.

### Assumptions

- This template remains optimized for small internal deployments and Docker-first production-style validation.
- Database role separation may initially be represented by separate URLs and docs even if local Compose still points them at the same Postgres container user.
- Hosted cloud-specific managed identity work is out of scope for this starter-sized spec unless a downstream deployment adds it.
- Existing route/auth code separation is already complete through spec 011 and is not repeated here.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Operators can identify the intended runtime owner for 100% of high-risk environment values in the examples and Compose file within 10 minutes.
- **SC-002**: Production-style Compose can run with distinct app, worker, and migration database URL variables without changing application behavior.
- **SC-003**: The app runtime has zero undocumented migration-only database credentials in its production-style environment.
- **SC-004**: Validation catches at least one deliberately introduced wrong-runtime database credential and one worker-only secret exposure before deployment.
- **SC-005**: Existing validation for app tests, worker tests, and Docker Compose config remains green after the separation work.
