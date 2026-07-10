# Quickstart Evidence: OpenTofu Azure Infrastructure

Date: 2026-06-08

This file records the final validation pass for `018-opentofu-azure-infra`.

## Bootstrap Ordering

The quickstart ordering is confirmed:

1. Bootstrap creates remote state, GitHub OIDC identity, runtime identities, and shared ACR.
2. Images are published to the shared ACR.
3. The selected environment is planned/applied with explicit image tags.
4. Secrets are populated in Key Vault.
5. Deployment validates tags, reconciles infrastructure, runs migrations, and only then promotes app and worker revisions.

This matches FR-014 and the deploy workflow contract: bootstrap before environment state, image availability before runtime promotion, and migration before app/worker promotion.

## Non-Destructive Checks

The following checks were run locally without creating Azure resources:

- `tofu -chdir=infra/azure fmt -check -recursive`: passed
- `tofu -chdir=infra/azure init -backend=false -input=false`: passed
- `tofu -chdir=infra/azure validate`: passed
- `tofu -chdir=infra/azure/bootstrap init -backend=false -input=false`: passed
- `tofu -chdir=infra/azure/bootstrap validate`: passed with an AzureRM storage-account deprecation warning only
- `node scripts/infra-plan-check.mjs`: passed
- `node scripts/infra-secret-exposure-check.mjs`: passed
- `node scripts/infra-observability-check.mjs`: passed
- `node scripts/infra-env-isolation.mjs`: passed

The measured `infra-plan-check` wall-clock for the placeholder dev plan was 26.3 seconds, under SC-001's 15 minute target.

## Local Runtime Checks

Local development and Docker Compose were validated without Azure credentials:

- `pnpm run dev`: startup passed after the local dev bootstrap regenerated the SQLite Prisma client.
- `docker compose config`: passed with temporary clean-room env files containing the required Postgres/auth settings and no Azure AD, Graph, or mail credentials.

The local dev script now regenerates the SQLite Prisma client for `file:` database URLs. This keeps `pnpm run dev` working after a previous Docker or CI-oriented PostgreSQL Prisma generation.

## Live Throwaway Apply

Live Azure resource creation was executed after operator approval.

- Subscription: `Sponsorship (tyrael)`
- Bootstrap project: `wattest`
- Bootstrap location: `westeurope`
- Shared ACR: `wattest7725mxacr.azurecr.io`
- App/worker image tag: `live-20260608-0859`
- Migration image tag: `live-20260608-0859-migrate`
- Successful environment: `staging`
- Successful environment location: `northeurope`
- Successful resource group: `wattest-staging-rg`
- App endpoint: `https://wattest-staging-app.purplewater-76fadf08.northeurope.azurecontainerapps.io/app-starter`
- Corrected app image tag: `live-20260608-0859-appfix`
- Migration execution: `wattest-staging-migration-om1l9ke`

Live timings:

- Bootstrap apply: succeeded.
- Initial `dev` plan in `westeurope`: 17.5 seconds.
- Initial `dev` apply in `westeurope`: partially created foundation resources, then failed because Azure reported `ManagedEnvironmentCapacityHeavyUsageError` for Container Apps/AKS capacity in `westeurope`.
- `staging` plan in `northeurope`: 29.7 seconds.
- `staging` apply in `northeurope`: 848.0 seconds, under SC-001's 15 minute target.
- Migration job image update: plan 65.2 seconds, apply 50.2 seconds.
- Migration job execution: succeeded, 2026-06-08T10:45:14Z to 2026-06-08T10:45:49Z.

Live validation observations:

- Container Apps app and worker provisioned successfully and reached `Running`.
- App pulled `wattest7725mxacr.azurecr.io/app:live-20260608-0859` through the private ACR path after ACR public network access was restored to `Disabled`.
- ACR final state: Premium SKU, public network access `Disabled`, default firewall action `Deny`.
- Key Vault secret creation from a local/GitHub-style runner requires public data-plane reachability during provisioning unless the runner is inside the VNet. The implementation now keeps Key Vault RBAC-protected and creates the private endpoint for runtime access, but does not disable public network access by default.
- PostgreSQL Flexible Server needed a pinned availability zone to avoid drift after Azure selected zone `2`.
- The first live app HTTP smoke returned `404` because the reused prebuilt app image had been built with `BASE_PATH=/webapp-template` while Azure configured `/app-starter`. A fresh ACR-built app image with `BASE_PATH=/app-starter` fixed the smoke:
  - `/app-starter/api/health`: `200`, database check `ok`
  - `/app-starter`: `200`
  - `/`: `404`, expected for a base-path build

Live resources remain in Azure for manual inspection:

- `wattest-bootstrap-rg`
- `wattest-staging-rg`
- Partial failed `wattest-dev-rg` from the `westeurope` capacity attempt

Teardown should remove these throwaway resource groups after inspection. Persistent resources have `prevent_destroy` guards, so follow the quickstart teardown procedure or delete the throwaway resource groups manually after confirming no data is needed.
