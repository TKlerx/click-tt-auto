# Feature Specification: OpenTofu Azure Infrastructure

**Feature Branch**: `018-opentofu-azure-infra`
**Created**: 2026-06-05
**Status**: Draft
**Input**: User description: "Spec OpenTofu Azure infrastructure deployment automation for this webapp template, including container app runtime, worker, migrations, PostgreSQL, registry, secrets, monitoring, and CI/CD deployment path."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## Clarifications

### Session 2026-06-05

- Q: Where should OpenTofu remote state live? → A: Azure Storage Account backend (per-env or shared container) with blob lease state locking; bootstrap creates the storage account before main provisioning.
- Q: What network posture for the MVP? → A: VNet-integrated Container Apps Environment on a shared/delegated subnet. Public ingress only on the app frontend; worker and migration are internal-only. Data plane (PostgreSQL, ACR, Key Vault) reachable only from the VNet, not externally.
- Q: How are dev/staging/prod isolated? → A: One resource group per environment within a single subscription.
- Q: What is the secret boundary split? → A: Azure Key Vault as the central source of truth; Container Apps reference secrets from Key Vault via managed identity.
- Q: How is custom domain / TLS handled in the MVP? → A: Use the default Container Apps FQDN (`<app>.<region>.azurecontainerapps.io`) with the platform default TLS certificate; no custom domain binding in MVP. Domain/base-URL inputs still drive app config (e.g. trusted origins, base path). Custom domain is a later customization (FR-016). Hosted runtime remains Azure Container Apps (app = ingress, worker = internal, migration = one-shot Container Apps Job); use a workload-profiles environment with a single Consumption profile to control cost while keeping VNet reach to private endpoints.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Provision A Complete Azure Runtime (Priority: P1)

An operator can create a production-ready Azure environment for a downstream app from this template without hand-assembling the core cloud resources.

**Why this priority**: The template is already Docker-first, but hosted deployment still requires repeatable infrastructure for containers, database, secrets, registry access, logging, and network boundaries.

**Independent Test**: Review the generated deployment plan for a new environment and confirm that it includes all required runtime resources, identity links, configuration values, and outputs needed to run the app, worker, and migration flow.

**Acceptance Scenarios**:

1. **Given** an operator has selected an Azure subscription, region, environment name, and domain/base URL values, **When** they review the deployment plan, **Then** they see resources for app runtime, worker runtime, migration execution, PostgreSQL, container image storage, secrets, monitoring, and required identities.
2. **Given** the plan is applied to an empty Azure resource group, **When** provisioning completes, **Then** the operator receives the app endpoint, database connection outputs needed by runtime configuration, registry information, and operational monitoring links.
3. **Given** provisioning fails part way through, **When** the operator reruns the same deployment with the same inputs, **Then** the process can converge without requiring manual cleanup of successfully created resources.

---

### User Story 2 - Deploy App, Worker, And Migrations Safely (Priority: P1)

An operator can deploy container images through a repeatable pipeline that runs database migrations before new app and worker revisions receive production traffic.

**Why this priority**: A cloud environment is only useful if application updates can be released safely and repeatedly without giving long-running services migration-only authority.

**Independent Test**: Execute a dry-run or staged deployment using known image tags and verify that the migration step, app runtime, and worker runtime receive the correct configuration and deployment order.

**Acceptance Scenarios**:

1. **Given** new app and worker image tags are available, **When** the deployment pipeline runs, **Then** the migration step completes successfully before app and worker revisions are promoted.
2. **Given** the migration step fails, **When** the deployment pipeline evaluates the result, **Then** app and worker revisions are not promoted and the failure is visible to operators.
3. **Given** separate runtime database credentials are configured, **When** services start, **Then** app, worker, and migration runtimes each receive only their intended database access path.

---

### User Story 3 - Manage Secrets And Runtime Configuration (Priority: P2)

An operator can define required secrets and runtime settings once, store sensitive values in a managed secret boundary, and expose only the necessary values to each runtime.

**Why this priority**: The template already separates app, worker, and migration credentials. Azure deployment automation must preserve that separation rather than flattening all secrets into every container.

**Independent Test**: Inspect the environment's secret inventory and runtime bindings to confirm each secret has an owner, target runtime, and documented source.

**Acceptance Scenarios**:

1. **Given** authentication, database, mail, Teams, and runtime secrets are supplied, **When** the deployment is planned, **Then** sensitive values are stored in a managed secret service or platform secret store rather than committed files.
2. **Given** a secret is worker-only, **When** app runtime configuration is inspected, **Then** the app runtime does not receive that secret unless an explicit exception is documented.
3. **Given** a secret value must rotate, **When** the operator updates the value and redeploys, **Then** the affected runtime can pick up the new value without rebuilding application images.

---

### User Story 4 - Observe And Operate The Deployment (Priority: P2)

An operator can monitor health, logs, revisions, background worker activity, and deployment failures from the provisioned Azure environment.

**Why this priority**: Hosted infrastructure must include enough operational visibility to debug startup issues, failed migrations, application errors, and worker failures.

**Independent Test**: Deploy a smoke environment, trigger an app request and a worker-visible job event, then confirm logs, health state, and deployment status are discoverable from the configured observability resources.

**Acceptance Scenarios**:

1. **Given** the app is deployed, **When** an operator opens monitoring, **Then** they can see app revision status, request logs, container logs, and health check outcomes.
2. **Given** the worker is running, **When** jobs are processed, **Then** worker logs and failures are visible in the same operational workspace.
3. **Given** a migration or deployment fails, **When** the operator reviews the deployment, **Then** the failure reason and affected runtime are visible without connecting directly to containers.

---

### User Story 5 - Support Multiple Environments (Priority: P3)

An operator can create isolated development, staging, and production environments using consistent inputs while preventing accidental cross-environment resource sharing.

**Why this priority**: The template is intended for downstream apps. Each app needs repeatable environments with clear names, tags, and separation.

**Independent Test**: Plan two environments with different names and confirm resources, databases, secrets, identities, and outputs do not collide.

**Acceptance Scenarios**:

1. **Given** staging and production inputs, **When** plans are generated, **Then** resource names, tags, secrets, database names, and service endpoints are environment-scoped.
2. **Given** an operator attempts to use production secrets in a non-production environment, **When** validation runs, **Then** the mismatch is reported before deployment.
3. **Given** an environment must be removed, **When** teardown is requested, **Then** the operator can identify which persistent data resources need explicit confirmation before deletion.

### Edge Cases

- Azure resource names may exceed service-specific length limits once project, environment, and region are combined.
- A subscription may not have required providers registered or may lack quota in the selected region.
- Container image tags may exist for one runtime but not another.
- A migration can succeed while a later app revision fails health checks.
- A downstream app may not enable mail or Teams features and should not be forced to provide unused secrets.
- PostgreSQL provisioning may need to preserve data during environment updates and avoid destructive replacement by default.
- GitHub Actions deployment may run without permission to create Azure resources if OIDC federation is not configured correctly.
- A bootstrap deployment may need to create the registry before images can be pushed.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST define the Azure resources required to host the web app runtime, background worker runtime, one-shot migration flow, PostgreSQL database, container image registry, secret storage, and monitoring workspace.
- **FR-002**: The system MUST support at least development, staging, and production environment names with isolated resources, tags, secrets, database names, and outputs, using one resource group per environment within a single subscription.
- **FR-003**: The system MUST provide a repeatable provisioning workflow that can plan changes before applying them.
- **FR-004**: The system MUST provide deployment automation that accepts explicit app, worker, and migration image tags.
- **FR-005**: The system MUST run database migrations before promoting new app and worker revisions.
- **FR-006**: The system MUST prevent app and worker revisions from being promoted when migration execution fails.
- **FR-007**: The system MUST preserve separate app, worker, and migration database access paths in hosted deployment configuration.
- **FR-008**: The system MUST store sensitive runtime values in Azure Key Vault as the central source of truth and MUST NOT require secrets to be committed to source control. Container Apps MUST reference these secrets from Key Vault via managed identity rather than holding standalone copies.
- **FR-009**: The system MUST expose only required secrets and settings to each runtime, with documented exceptions for intentionally shared values.
- **FR-010**: The system MUST configure registry access so hosted runtimes can pull approved images without embedding registry passwords in source-controlled files.
- **FR-011**: The system MUST provide operator-facing outputs for app endpoint, registry identity, database host, monitoring workspace, and deployment identity setup.
- **FR-012**: The system MUST include health and logging configuration for app, worker, and migration execution.
- **FR-013**: The system MUST make destructive operations against persistent data resources explicit and opt-in.
- **FR-014**: The system MUST document bootstrap ordering for registry creation, image publication, infrastructure provisioning, migration execution, and runtime rollout.
- **FR-015**: The system MUST support GitHub Actions based deployment using federated cloud identity rather than long-lived cloud credentials.
- **FR-016**: The system MUST document how a downstream app customizes names, region, domain/base URL, image tags, scale limits, database sizing, and optional integrations.
- **FR-017**: The system MUST include a validation path that checks required inputs, missing secrets, image tag presence, and environment naming before deployment.
- **FR-018**: Existing local development and Docker Compose workflows MUST continue to work without requiring Azure credentials.
- **FR-019**: The system MUST store OpenTofu remote state in an Azure Storage Account backend with blob lease state locking, and the bootstrap flow MUST create the state storage account before main infrastructure provisioning.
- **FR-020**: The system MUST deploy runtimes into a VNet-integrated Container Apps Environment on a shared subnet, exposing public ingress only on the app frontend while keeping worker and migration runtimes internal-only.
- **FR-021**: The system MUST restrict the data plane (PostgreSQL, container registry, and Key Vault) to VNet-only reachability so these services are not accessible from the public internet.
- **FR-022**: The system MUST use the default Container Apps FQDN with the platform-provided TLS certificate for the MVP; custom domain binding is an optional later customization under FR-016.

### Key Entities _(include if feature involves data)_

- **Azure Environment**: A named deployment target such as development, staging, or production with its own resources, configuration, and outputs.
- **Runtime Service**: A hosted execution unit for the web app, background worker, or migration flow.
- **Container Image Reference**: The registry, repository, and tag used to identify an app, worker, or migration image for deployment.
- **Runtime Secret**: A sensitive value required by one or more runtimes, including database credentials, auth secrets, integration secrets, and trust-proxy secrets.
- **Deployment Identity**: The cloud or CI identity authorized to plan, apply, publish images, update secrets, and deploy revisions.
- **Persistent Data Resource**: A database, storage account, secret vault, log workspace, or other resource whose deletion can cause data loss or operational history loss.
- **Environment Output**: A value produced by provisioning that operators or CI use later, such as app endpoint, registry name, monitoring workspace, or identity identifiers.
- **Infrastructure State Store**: The Azure Storage Account backend (with blob lease locking) that holds OpenTofu remote state, created during bootstrap before main provisioning.

### Assumptions

- Azure Container Apps is the default hosted runtime target because the template already separates app, worker, and migration containers.
- Azure Database for PostgreSQL Flexible Server is the default managed database target.
- Azure Container Registry is the default image registry target.
- Azure Key Vault is the central secret boundary (source of truth); Container Apps reference its secrets via managed identity.
- GitHub Actions is the first CI/CD target because the repository already uses GitHub workflows.
- Azure DevOps can be documented as a later deployment adapter if needed, but is not required for the MVP.
- The MVP uses a VNet-integrated Container Apps Environment on a shared subnet: only the app frontend has public ingress; worker, migration, and the data plane (PostgreSQL, registry, Key Vault) are reachable only from the VNet.
- OpenTofu state is stored in an Azure Storage Account backend with blob lease locking, created during bootstrap before main provisioning.
- Each environment lives in its own resource group within a single subscription.
- Cost controls should default to small internal-app environments rather than high-availability enterprise scale.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An operator can generate a plan for a new Azure environment in under 15 minutes using documented inputs.
- **SC-002**: The provisioning plan includes 100% of required app, worker, migration, database, registry, secret, monitoring, and identity resources.
- **SC-003**: A staged deployment with known image tags completes migration before app and worker promotion in every successful run.
- **SC-004**: A deliberately failing migration prevents app and worker promotion and reports the failure in the deployment workflow.
- **SC-005**: Runtime configuration review shows zero undocumented worker-only or migration-only secrets exposed to the app runtime.
- **SC-006**: Operators can locate app logs, worker logs, migration logs, and revision health within 5 minutes of a deployment.
- **SC-007**: Planning two environments with different names produces no shared database, secret, runtime, or app endpoint names except explicitly shared bootstrap resources.
- **SC-008**: Local development and Docker Compose validation remain usable without Azure credentials.
