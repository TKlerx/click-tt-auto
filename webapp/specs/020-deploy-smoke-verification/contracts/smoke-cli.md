# Contract: Azure Deploy Smoke CLI

## Command

```bash
pnpm run smoke:azure -- --environment dev --app-endpoint https://example.com/starter --resource-group rg-app-dev --app-name ca-app-dev --worker-name ca-worker-dev --migration-job-name job-migrate-dev
```

The command may also read values from environment variables for GitHub Actions integration.

## Inputs

| CLI flag                | Environment variable        | Required | Description                                               |
| ----------------------- | --------------------------- | -------- | --------------------------------------------------------- |
| `--environment`         | `SMOKE_ENVIRONMENT`         | Yes      | Target environment label.                                 |
| `--app-endpoint`        | `SMOKE_APP_ENDPOINT`        | Yes      | Public app endpoint, including base path when configured. |
| `--resource-group`      | `SMOKE_RESOURCE_GROUP`      | Yes      | Azure resource group.                                     |
| `--app-name`            | `SMOKE_APP_NAME`            | Yes      | Web Container App name.                                   |
| `--worker-name`         | `SMOKE_WORKER_NAME`         | Yes      | Worker Container App name.                                |
| `--migration-job-name`  | `SMOKE_MIGRATION_JOB_NAME`  | Yes      | Migration Container Apps Job name.                        |
| `--migration-execution` | `SMOKE_MIGRATION_EXECUTION` | No       | Specific migration execution to verify.                   |
| `--timeout-seconds`     | `SMOKE_TIMEOUT_SECONDS`     | No       | Overall per-check timeout; default 120.                   |
| `--json`                | `SMOKE_JSON`                | No       | Print only machine-readable JSON when true.               |

## Checks

1. Application health: `GET <app-endpoint>/api/health` must return HTTP 200 with `status: "ok"`.
2. Migration job: latest or supplied migration execution must be `Succeeded`.
3. App revision: active web Container App revision must report healthy/running state.
4. Worker revision: latest worker revision must report healthy/running state.

## Exit Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| `0`  | All required smoke checks passed.         |
| `1`  | One or more required smoke checks failed. |
| `2`  | Configuration or invocation was invalid.  |

## Output

Human output:

```text
Azure deployment smoke: dev
PASS app-health https://example.com/starter/api/health
PASS migration job-migrate-dev/execution-name
PASS app-revision ca-app-dev/latest
PASS worker-revision ca-worker-dev/latest
Result: PASS
```

JSON output:

```json
{
  "environment": "dev",
  "status": "pass",
  "checks": [
    {
      "name": "app-health",
      "status": "pass",
      "target": "https://example.com/starter/api/health",
      "durationMs": 120,
      "message": "Health endpoint returned ok"
    }
  ]
}
```

All output must be sanitized before printing.
