# Quickstart: Azure Deployment Smoke Verification

## Local operator run

1. Authenticate with Azure CLI.

```bash
az login
```

2. Gather values from `tofu output` or the deployment workflow summary.

```bash
cd infra/azure
tofu output -raw app_endpoint
tofu output -raw resource_group_name
tofu output -raw app_container_app_name
tofu output -raw worker_container_app_name
tofu output -raw migration_job_name
```

3. Run the smoke check.

```bash
pnpm run smoke:azure -- \
  --environment dev \
  --app-endpoint "$(tofu output -raw app_endpoint)" \
  --resource-group "$(tofu output -raw resource_group_name)" \
  --app-name "$(tofu output -raw app_container_app_name)" \
  --worker-name "$(tofu output -raw worker_container_app_name)" \
  --migration-job-name "$(tofu output -raw migration_job_name)"
```

The command exits `0` only when the app health endpoint, migration job, app revision, and worker revision checks all pass.

## GitHub Actions run

The Azure deployment workflow runs smoke verification after migration and revision promotion. The workflow summary includes the same pass/fail evidence as local output.

## Failure handling

- App health failure: inspect the app endpoint, database health, and recent app logs.
- Migration failure: inspect the named migration execution in Azure Container Apps Jobs.
- Revision failure: inspect active revisions for the named app or worker Container App.
- Configuration failure: confirm the workflow variables and OpenTofu outputs match the target environment.
