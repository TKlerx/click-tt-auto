# Phase 0 Research: OpenTofu Azure Infrastructure

All NEEDS CLARIFICATION items from the spec were resolved during `/speckit.clarify` (Session 2026-06-05). This document records the resulting technical decisions, rationale, and rejected alternatives.

## D1. IaC tool & provider

- **Decision**: OpenTofu (Terraform-compatible HCL) with the `azurerm` (~> 4.x) and `azuread` providers.
- **Rationale**: Feature is explicitly OpenTofu. `azurerm` covers Container Apps, PostgreSQL Flexible Server, ACR, Key Vault, and Log Analytics/App Insights. `azuread` is needed for the OIDC federated credential / app registration used by GitHub Actions (FR-015).
- **Alternatives considered**: Bicep/ARM (Azure-native but not the requested tool, weaker multi-cloud/portability story); Pulumi (extra language runtime, more dependencies — rejected per Constitution dependency minimization).

## D2. Remote state backend

- **Decision**: `azurerm` backend on a dedicated Azure Storage Account, blob container per project, **state key per environment** (e.g. `app/dev.tfstate`). Blob lease provides locking. Created by `bootstrap/` before main config.
- **Rationale**: Native to Azure, supports locking + encryption-at-rest, no external SaaS, works with the OIDC CI identity (clarify Q1). Per-environment state keys give isolation without separate accounts.
- **Alternatives considered**: HCP/Terraform Cloud (external SaaS dependency, account/cost — rejected); local state (no locking, not team/CI safe — rejected).
- **Open detail for Phase 1**: whether dev/staging/prod share one state Storage Account (cheaper, simplest) or one per env. Default: **shared account, separate state keys + separate containers**, since environments already isolate via resource groups.

## D3. Compute runtime

- **Decision**: Azure Container Apps **workload-profiles environment** running a single **Consumption** profile.
  - app → Container App, external ingress, public FQDN.
  - worker → Container App, **no ingress** (internal), min replicas 1 (long-running poller).
  - migration → Container Apps **Job** (manual/triggered, restart=Never), gates promotion.
- **Rationale**: Template already ships three containers (`Dockerfile.app`, `Dockerfile.worker`, migrate command reusing `Dockerfile.app`). Container Apps Jobs natively express the one-shot migrate-before-promote flow (FR-005/FR-006). The workload-profiles environment with only a Consumption profile keeps consumption billing + scale-to-zero (cheaper than App Service plans for low/bursty internal traffic — clarify Q5) **while supporting full VNet integration and reachability to private endpoints** (ACR/Key Vault/PostgreSQL), which the legacy Consumption-only environment does not fully support. Scale-to-zero applies to the app; worker stays warm.
- **Alternatives considered**: Azure App Service (no clean one-shot job primitive; would need a bolt-on WebJob/ACI — rejected); AKS (heavy operationally for a small internal app, violates Simplicity — rejected); ACI alone (no revision/ingress/scaling model — rejected).

## D4. Network posture

- **Decision**: VNet-integrated Container Apps Environment on a shared/delegated subnet. Only the app frontend has public ingress; worker + migration are internal-only. PostgreSQL, ACR, and Key Vault are reachable only from the VNet (private access / VNet rules / private endpoint as appropriate per service), not from the public internet.
- **Rationale**: clarify Q2 — meets "small internal-app" cost goal while keeping the data plane off the public internet. Single subnet keeps it cheap and simple vs. full private-endpoint mesh.
- **Alternatives considered**: Fully public with firewall rules only (weaker — rejected); full private networking with private endpoints for every service + private DNS zones (more cost/complexity than MVP needs, documented as an upgrade path).
- **Phase 1 detail**: PostgreSQL Flexible Server VNet integration uses **delegated subnet + private DNS zone** (its standard private-access mode). ACR/Key Vault are VNet-only (public network access disabled) via **private endpoints** in the environment's subnet. The workload-profiles environment (Consumption profile) supports VNet egress to these private endpoints, so no Dedicated profile is required.

## D5. Secrets boundary

- **Decision**: Azure Key Vault is the central source of truth. Container Apps and the migration Job reference secrets from Key Vault via **user-assigned managed identity** + Key Vault secret references; no standalone secret copies committed or duplicated per runtime.
- **Rationale**: clarify Q4 — central rotation, audit, RBAC per runtime; satisfies FR-008/FR-009 (least exposure per runtime) and constitution "no secrets in source".
- **Secret-to-runtime mapping** (FR-009 least privilege):
  - app: auth secrets, `APP_DATABASE_URL`, trust-proxy secret, base-path/origin config.
  - worker: `WORKER_DATABASE_URL`, Graph/Teams/mail secrets (only if those integrations are enabled — FR optional integrations).
  - migration Job: `MIGRATION_DATABASE_URL` only.
- **Alternatives considered**: Container Apps native secrets only (weaker audit/rotation — rejected as source of truth); hybrid (unneeded complexity for a small app — rejected).

## D6. Database

- **Decision**: Azure Database for PostgreSQL Flexible Server, VNet-only, with three logical access paths (app/worker/migration) mapped to distinct database roles/connection strings stored in Key Vault. Burstable tier (e.g. `B1ms`/`B2s`) as the small-internal default.
- **Rationale**: Managed, matches the Docker Compose Postgres model; preserves the existing per-runtime `APP_/WORKER_/MIGRATION_DATABASE_URL` separation (FR-007). Burstable tier fits the cost profile; production `.tfvars` can size up.
- **Destructive-op guard (FR-013)**: `prevent_destroy` lifecycle on the server + database; teardown of persistent data requires explicit opt-in variable. Default `apply` must not replace/drop the database (clarify: data preserved across updates).
- **Alternatives considered**: Single shared connection string for all runtimes (violates FR-007 separation — rejected); Cosmos/other (app is Prisma+Postgres — rejected).

## D7. Container registry

- **Decision**: A **single shared** Azure Container Registry (Premium SKU) provisioned in `bootstrap/`, public network access disabled (VNet-only via private endpoint), pulled by each environment's runtime managed identity (`AcrPull` role). Premium is required for private endpoint support with disabled public access. No registry passwords in source (FR-010).
- **Rationale**: clarify Q2 data-plane-private; managed-identity pull avoids embedded credentials. The deploy flow promotes the **same image tag** dev→staging→prod, so one registry matches the workflow, avoids per-env rebuild/retag, and saves cost. SC-007 explicitly permits shared bootstrap resources. Two repositories: the app image (also used by the migration Job) and the worker image.
- **Bootstrap ordering (FR-014)**: the shared ACR must exist and images must be pushed before any environment's runtimes can pull. Bootstrap creates the ACR before first image publish and before environment provisioning; documented in quickstart.

## D8. Observability

- **Decision**: Log Analytics workspace as the Container Apps Environment log destination + Application Insights for the app. Operator outputs include workspace + App Insights identifiers (FR-011/FR-012).
- **Rationale**: Container Apps natively streams app/worker/job logs and revision/health status to Log Analytics; satisfies US4 (app logs, worker logs, migration/job failure visibility without exec into containers) and SC-006 (< 5 min to locate logs).
- **Alternatives considered**: Container-only stdout (not queryable/centralized — rejected).

## D9. CI/CD & identity

- **Decision**: GitHub Actions workflow `deploy-azure.yml` using OIDC federated credentials (workload identity federation) against an Entra app registration with subscription-scoped RBAC. No long-lived secrets (FR-015). Deploy order: `tofu plan/apply` (or image-tag update) → run migration Job → on success promote app + worker revisions; on migration failure, do **not** promote and surface failure (FR-004/FR-005/FR-006).
- **Rationale**: Repo already uses GitHub workflows (`validate.yml`, `cli-release.yml`); OIDC removes stored cloud credentials.
- **Federated credential subjects**: scoped to the repo + environment (branch/environment claims) to bound which workflows can deploy which Azure environment.
- **Alternatives considered**: Service principal client secret (long-lived credential — rejected); Azure DevOps (documented as later adapter, not MVP per spec assumption).

## D10. Environment isolation

- **Decision**: One resource group per environment (`<project>-<env>-rg`) in a single subscription; all names/tags environment-scoped via locals derived from `var.environment` + `var.project`; remote state keyed per environment.
- **Rationale**: clarify Q3 — clean blast radius and teardown, no multi-subscription overhead for a small internal app. Satisfies FR-002 / SC-007 (no shared names except explicitly shared bootstrap resources like the state account/ACR if chosen shared).
- **Naming**: derive a deterministic short suffix (e.g. `random_string` or hash) to stay within Azure name length limits (edge case in spec) for globally-unique names (Storage, ACR, Key Vault).

## D11. TLS / custom domain

- **Decision**: MVP uses the default Container Apps FQDN with the platform-managed TLS certificate. `domain` / base-URL inputs drive app config (`AUTH_BASE_URL`, `BASE_PATH`, trusted origins) but no custom domain binding is provisioned.
- **Rationale**: clarify Q5 — zero cert/DNS management for MVP; custom domain + managed certificate is a later FR-016 customization.
- **Alternatives considered**: Managed cert + custom domain binding now (extra DNS validation step, not needed for MVP); BYO cert in Key Vault (more setup — deferred).

## D12. Local dev non-regression

- **Decision**: All Azure code is additive under `infra/azure/`; no change to `src/`, `worker/`, `docker-compose.yml`, or local `.env` flows. Validation includes confirming `pnpm run dev` / Docker Compose still work without Azure credentials (FR-018, SC-008).
- **Rationale**: Constitution + FR-018 require local/Docker workflows to remain credential-free and unchanged.

## Resolved post-analysis (2026-06-05)

- D4: Use a **workload-profiles environment with a single Consumption profile** — supports VNet + private endpoints with consumption billing/scale-to-zero. No Dedicated profile needed. (No open item.)
- D7: **Single shared ACR in `bootstrap/`** (same image tag promoted across environments; SC-007 allows shared bootstrap resources).
- D2: Shared state Storage Account in `bootstrap/`, separate state keys per environment.
