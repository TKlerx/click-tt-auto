# Azure OpenTofu Infrastructure

This directory contains the OpenTofu configuration for spec `018-opentofu-azure-infra`.

Start with the operator guide in [`../../specs/018-opentofu-azure-infra/quickstart.md`](../../specs/018-opentofu-azure-infra/quickstart.md). The latest non-destructive quickstart evidence is recorded in [`../../specs/018-opentofu-azure-infra/quickstart-evidence.md`](../../specs/018-opentofu-azure-infra/quickstart-evidence.md).

Contracts:

- [`variables-contract.md`](../../specs/018-opentofu-azure-infra/contracts/variables-contract.md)
- [`outputs-contract.md`](../../specs/018-opentofu-azure-infra/contracts/outputs-contract.md)
- [`deploy-workflow-contract.md`](../../specs/018-opentofu-azure-infra/contracts/deploy-workflow-contract.md)

Current structure:

- `bootstrap/`: one-time state, identity, and shared registry setup
- `environments/`: per-environment inputs:
  - [`environments/dev.tfvars`](environments/dev.tfvars)
  - [`environments/staging.tfvars`](environments/staging.tfvars)
  - [`environments/prod.tfvars`](environments/prod.tfvars)
- `modules/`: reusable Azure resource groups for [`network`](modules/network), [`data`](modules/data), [`secrets`](modules/secrets), [`observability`](modules/observability), and [`runtime`](modules/runtime)

Validation:

- `tofu -chdir=infra/azure fmt -check -recursive`
- `tofu -chdir=infra/azure validate`
- [`node scripts/infra-plan-check.mjs`](../../scripts/infra-plan-check.mjs)
- [`node scripts/infra-secret-exposure-check.mjs`](../../scripts/infra-secret-exposure-check.mjs)
- [`node scripts/infra-observability-check.mjs`](../../scripts/infra-observability-check.mjs)
- [`node scripts/infra-env-isolation.mjs`](../../scripts/infra-env-isolation.mjs)
- `pwsh -NoProfile -File ../../scripts/supply-chain-audit.ps1 -Artifact infra -SkipBuild -SkipImageScans`

The plan check uses `infra/azure/environments/dev.tfvars` with placeholder bootstrap outputs and `-refresh=false`; it proves the environment graph includes the app, worker, migration job, PostgreSQL, Key Vault, private endpoints, observability, and role assignments without applying resources.

Database access:

- PostgreSQL is provisioned as VNet-only with public network access disabled and `prevent_destroy`.
- PostgreSQL availability zone is pinned by `postgres_availability_zone` so Azure's selected zone does not cause provider drift on the next apply.
- The data module emits distinct app, worker, and migration database URLs so runtime bindings stay separated.
- The migration Container Apps Job receives the admin URL only for `scripts/postgres-provision-roles.mjs`, which creates or updates the app, worker, and migration roles before Prisma migrations run.

Secret exposure:

- Key Vault is RBAC-protected, default-deny at the network ACL, and has a
  private endpoint for runtime access. Public network access remains enabled so
  deployment-time secret writes can be performed from explicitly allowed
  operator or CI public IPv4/CIDR ranges in `key_vault_allowed_ip_rules`; keep
  that list empty when OpenTofu runs from inside the VNet.
- App runtime: `app-database-url`, `betterauth-secret`; Teams secrets only when `enable_teams=true`.
- Worker runtime: `worker-database-url`; Graph mail secrets only when `enable_mail=true`; Teams worker secrets only when `enable_teams=true`.
- Migration job: `migration-database-url`, `initial-admin-*`, plus `admin-database-url`, `app-database-url`, and `worker-database-url` for the one-time PostgreSQL role bootstrap path.
- Optional mail and Teams secrets are not created or bound when their `enable_*` flag is false.
- `secret_environment` must match `environment`, preventing production-labeled operator secrets from being planned into dev or staging.

Observability:

- The Container Apps environment sends console/system logs to Log Analytics.
- App and worker Container Apps export `AllMetrics` diagnostic settings to the same workspace for revision and replica health.
- The app container receives `APPLICATIONINSIGHTS_CONNECTION_STRING`; the root output is marked sensitive.
- Use [`../../tests/infra/observability-smoke.md`](../../tests/infra/observability-smoke.md) after a staged apply to confirm app, worker, migration, and health queries.

Deployment workflow:

- `.github/workflows/deploy-azure.yml` uses GitHub OIDC (`id-token: write`) and Azure login without a client secret.
- Configure each GitHub Environment (`dev`, `staging`, `prod`) with variables for `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, bootstrap state outputs, shared ACR outputs, deployment identity ids, runtime identity ids, `PROJECT`, and `AZURE_LOCATION`.
- The workflow validates requested ACR tags, reconciles OpenTofu infrastructure, runs the migration Container Apps Job with the migration image, and only then updates the app and worker images.
- The shared ACR uses Premium SKU so private endpoints and disabled public network access are supported.

The bootstrap state storage account has default-deny network rules. Set
`state_storage_allowed_ip_rules` to the operator or CI public IPv4/CIDR ranges
that need OpenTofu backend data-plane access.

Do not commit state, local variable files, or secrets.

Persistent teardown:

- PostgreSQL, Key Vault, Log Analytics, and Application Insights use static `prevent_destroy` guards.
- `allow_destroy_persistent=true` records explicit teardown intent; it does not bypass lifecycle guards by itself.
- Follow the teardown order in the quickstart and keep any lifecycle override local to the approved teardown session.
