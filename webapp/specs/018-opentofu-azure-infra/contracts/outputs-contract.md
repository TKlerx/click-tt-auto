# Contract: OpenTofu Outputs (operator-facing)

Satisfies FR-011. Consumed by operators and the deploy workflow.

| Output                           | Type   | Sensitive | Description                                                           |
| -------------------------------- | ------ | --------- | --------------------------------------------------------------------- |
| `app_endpoint`                   | string | no        | Public HTTPS URL of the app (default Container Apps FQDN + base path) |
| `app_fqdn`                       | string | no        | Raw Container App FQDN                                                |
| `registry_login_server`          | string | no        | ACR login server for push/pull                                        |
| `registry_name`                  | string | no        | ACR resource name                                                     |
| `database_host`                  | string | no        | PostgreSQL Flexible Server FQDN (reachable only from VNet)            |
| `database_name`                  | string | no        | Application database name                                             |
| `key_vault_uri`                  | string | no        | Key Vault URI (secret management)                                     |
| `log_analytics_workspace_id`     | string | no        | Observability workspace                                               |
| `app_insights_connection_string` | string | **yes**   | App telemetry connection (marked sensitive)                           |
| `deployment_identity_client_id`  | string | no        | Entra app/MI client id for CI OIDC setup                              |
| `runtime_identity_principal_id`  | string | no        | User-assigned MI principal (ACR pull / KV read)                       |
| `migration_job_name`             | string | no        | Container Apps Job name (deploy workflow triggers this)               |
| `app_container_app_name`         | string | no        | For revision promotion                                                |
| `worker_container_app_name`      | string | no        | For revision promotion                                                |

## Notes

- No secret values are emitted as plain outputs; secrets live in Key Vault and are referenced by runtimes via managed identity (FR-008/FR-009). Only the App Insights connection string is surfaced and is flagged `sensitive = true`.
- Outputs are stable contract names; renaming requires a contract update and a consumer (workflow) update.
