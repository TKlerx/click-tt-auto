# Azure Deploy Smoke Verification

Use the Azure deploy smoke check after a deployment to prove that the app endpoint, migration job, web revision, and worker revision are healthy.

## Prerequisites

- Azure CLI authenticated for the target subscription.
- Values from the Azure OpenTofu outputs or the deployment workflow summary.
- Project dependencies installed with `pnpm install --frozen-lockfile`.

## Local Run

```bash
cd infra/azure

pnpm --dir ../.. run smoke:azure -- \
  --environment dev \
  --app-endpoint "$(tofu output -raw app_endpoint)" \
  --resource-group "$(tofu output -raw resource_group_name)" \
  --app-name "$(tofu output -raw app_container_app_name)" \
  --worker-name "$(tofu output -raw worker_container_app_name)" \
  --migration-job-name "$(tofu output -raw migration_job_name)"
```

The command exits `0` only when all required checks pass. It exits `1` when a smoke check fails and `2` when configuration is missing or invalid.

## JSON Output

Use `--json` when another tool needs the smoke result.

```bash
pnpm run smoke:azure -- --json --environment dev ...
```

The JSON report includes the target environment, overall status, and one result per check. Output is sanitized before printing.

## GitHub Actions

The `Deploy Azure` workflow runs smoke verification after migration success and app/worker revision promotion. The workflow fails if smoke verification fails, and the GitHub step summary includes the sanitized smoke output.

## Troubleshooting

- `app-health` failed: open the checked `/api/health` URL, inspect database health, and check recent app logs.
- `migration` failed: inspect the named Container Apps Job execution.
- `app-revision` or `worker-revision` failed: inspect active revisions for the named Container App.
- Configuration failed: confirm the workflow variables and OpenTofu outputs match the target environment.
