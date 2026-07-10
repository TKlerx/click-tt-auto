# Quickstart: Deploy this template to Azure with OpenTofu

Operator guide for provisioning and deploying an environment. Covers the bootstrap ordering required by FR-014.

> Local development and Docker Compose are unaffected by any of this and need **no** Azure credentials (FR-018). This guide is only for hosted Azure deployment.

## Prerequisites

- OpenTofu >= 1.8, Azure CLI, an Azure subscription, and `Owner`/`Contributor` + `User Access Administrator` to create role assignments.
- The app and worker container images buildable from `Dockerfile.app` and `Dockerfile.worker`.

## Step 0 — Bootstrap (once per subscription)

Creates the OpenTofu state Storage Account, the GitHub OIDC federated identity, and the **single shared Azure Container Registry** used by all environments. The registry uses Premium SKU because Azure private endpoints and disabled public network access require Premium. This must run before the main config because the main config stores its state in that account (clarify Q1) and pulls images from the shared ACR.

```bash
cd infra/azure/bootstrap
tofu init
tofu apply   # creates: state RG + Storage Account + container, Entra app registration + federated credential, base role assignments, shared ACR
```

Record the outputs (state account name, container, app/client id, ACR login server) — they configure `backend.tf`, the GitHub OIDC login, and image push/pull.

## Step 1 — Publish images to the shared registry (FR-014 ordering)

The shared ACR (from Step 0) must contain the images before any environment's runtimes can pull them.

- Push the app, worker, and migration images. The migration image can use the app repository with a separate tag, or a separate repository via `migration_image_repository`.

```bash
az acr login --name <acr-name>
docker build -f Dockerfile.app \
  --build-arg APP_VERSION=<env-or-release-version> \
  --build-arg APP_REVISION=<git-sha> \
  --build-arg APP_BUILD_ID=<ci-run-id> \
  --build-arg APP_BUILT_AT=<iso-timestamp> \
  -t <acr-login-server>/app:<tag> .
docker build -f Dockerfile.app --target migrate-runner \
  --build-arg APP_VERSION=<env-or-release-version> \
  --build-arg APP_REVISION=<git-sha> \
  --build-arg APP_BUILD_ID=<ci-run-id> \
  --build-arg APP_BUILT_AT=<iso-timestamp> \
  -t <acr-login-server>/app:<migration-tag> .
docker build -f Dockerfile.worker \
  --build-arg APP_VERSION=<env-or-release-version> \
  --build-arg APP_REVISION=<git-sha> \
  --build-arg APP_BUILD_ID=<ci-run-id> \
  --build-arg APP_BUILT_AT=<iso-timestamp> \
  -t <acr-login-server>/worker:<tag> .
docker push <acr-login-server>/app:<tag>
docker push <acr-login-server>/app:<migration-tag>
docker push <acr-login-server>/worker:<tag>
```

## Step 2 — Provision an environment

```bash
cd infra/azure
tofu init   # uses azurerm backend from bootstrap outputs
tofu plan  -var-file=environments/dev.tfvars   # review (SC-001: < 15 min)
tofu apply -var-file=environments/dev.tfvars
```

Provisions: VNet + subnet + private endpoints, PostgreSQL Flexible Server (VNet-only), Key Vault, Log Analytics + App Insights, Container Apps Environment (workload-profiles / Consumption), app + worker Container Apps, and the migration Job. (The shared ACR comes from bootstrap; this env is granted `AcrPull`.)

## Step 3 — Set secrets in Key Vault

Populate required secrets (the app/worker/migration database URLs, `BETTERAUTH_SECRET`, and any enabled mail/Teams secrets). Nothing secret goes into source control (FR-008). Mail/Teams secrets are only required when `enable_mail` / `enable_teams` are true.

The default module creates these generated/runtime secrets during OpenTofu apply. If the runner is not inside the VNet, Key Vault must remain publicly reachable for provisioning and locked down by RBAC; the runtime path still uses managed identity and the private endpoint.

## Step 4 — Deploy (app, worker, migration)

Trigger the GitHub Actions `deploy-azure.yml` workflow (or run the equivalent steps manually). Required order (see deploy-workflow-contract.md):

1. Validate inputs + image tag presence.
2. `tofu apply` to set the new image tags.
3. Run the migration **Job** and wait.
4. On success → promote app + worker revisions. On failure → no promotion, failure surfaced (FR-005/FR-006).

## Step 5 — Observe

From the outputs, open the Log Analytics workspace / Application Insights to see app logs, worker logs, migration Job results, and revision health (US4, SC-006).

## Step 6 — Smoke verify the deployment

Run the deploy smoke check after promotion to confirm the app endpoint, migration execution, app revision, and worker revision are all healthy. The GitHub `Deploy Azure` workflow runs this automatically after app and worker promotion. Operators can also run it locally:

```bash
pnpm run smoke:azure -- \
  --environment dev \
  --app-endpoint "$(tofu output -raw app_endpoint)" \
  --resource-group "$(tofu output -raw resource_group_name)" \
  --app-name "$(tofu output -raw app_container_app_name)" \
  --worker-name "$(tofu output -raw worker_container_app_name)" \
  --migration-job-name "$(tofu output -raw migration_job_name)"
```

See `docs/azure-deploy-smoke.md` for JSON output and failure troubleshooting.

## Outputs you get (FR-011)

`app_endpoint`, `registry_login_server`, `database_host`, `key_vault_uri`, `log_analytics_workspace_id`, `app_insights_connection_string` (sensitive), `deployment_identity_client_id`, plus the Container App / Job names used for promotion. See outputs-contract.md.

## Multiple environments

Repeat Step 2 with `environments/staging.tfvars` / `prod.tfvars`. Each gets its own resource group, names, secrets, database, and endpoints (FR-002 / SC-007). Production `.tfvars` typically sizes up `postgres_sku` and replica limits.

Each environment file sets `secret_environment` to the same value as `environment`. Leave it empty to default to the target environment. Do not set it to `prod` for dev/staging: the plan fails before provisioning so production-sourced secrets cannot be wired into non-production infrastructure.

Validate isolation before applying:

```bash
node scripts/infra-env-isolation.mjs
```

## Teardown (careful — FR-013)

Persistent data resources (PostgreSQL, Key Vault, Log Analytics, Application Insights) use static `prevent_destroy` lifecycle guards. `allow_destroy_persistent = true` records explicit operator intent, but OpenTofu lifecycle settings cannot be switched by variables; an actual deletion still needs a deliberate temporary override or manual teardown procedure.

Recommended teardown order:

1. Disable the GitHub deployment environment or workflow triggers for the target environment.
2. Back up PostgreSQL data, export any required Key Vault secrets, and confirm observability retention requirements.
3. Create a local, uncommitted teardown var file for the target environment with `allow_destroy_persistent = true`.
4. Run `tofu plan -destroy -var-file=<env>.tfvars -var-file=<local-teardown>.tfvars` and review the resources blocked by `prevent_destroy`.
5. For each approved persistent resource, temporarily relax the matching lifecycle guard or delete it manually after removing it from state. Keep this change scoped to the teardown branch/session and do not commit broad destroy overrides.
6. Destroy runtime/network resources after persistent data decisions are complete.

## Custom domain (later, FR-016)

MVP serves on the default Container Apps FQDN with platform TLS. To use a custom domain, set `custom_domain` and add the managed-certificate + domain binding (documented as a follow-up; not required for MVP — clarify Q5).
