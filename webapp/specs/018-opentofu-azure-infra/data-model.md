# Phase 1 Data Model: OpenTofu Azure Infrastructure

This feature's "data model" is the set of infrastructure entities (Azure resources and IaC inputs/outputs) and their relationships, derived from the spec's Key Entities and Functional Requirements. It is not an application database schema.

## Entity: Azure Environment

A named deployment target (dev / staging / production).

| Field                 | Type                              | Notes                                                                         |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `environment`         | string (enum: dev, staging, prod) | Drives all naming/tags; one resource group per value (FR-002)                 |
| `project`             | string                            | Short project slug; combined with `environment` for names                     |
| `location`            | string                            | Azure region (e.g. `westeurope`)                                              |
| `resource_group_name` | derived                           | `<project>-<environment>-rg`                                                  |
| `name_suffix`         | derived                           | Deterministic short suffix for globally-unique names (length-limit edge case) |
| `tags`                | map(string)                       | Includes `environment`, `project`, `managed-by=opentofu`                      |
| `secret_environment`  | string                            | Empty defaults to `environment`; must match target environment                |

- **Relationships**: contains exactly one of each: Network, Database, Registry (or references shared), Key Vault, Observability workspace, Runtime set.
- **Validation**: `environment` must be one of the allowed values; `secret_environment` must match the target environment so production-sourced secrets are rejected in non-production plans; names must satisfy per-service Azure length/character limits.
- **Lifecycle**: created on first `apply`; teardown is explicit and gated for persistent data (FR-013).

## Entity: Infrastructure State Store (bootstrap)

OpenTofu remote state backend (clarify Q1).

| Field                        | Type                     | Notes                                       |
| ---------------------------- | ------------------------ | ------------------------------------------- |
| `state_storage_account_name` | string (globally unique) | Created by `bootstrap/` before main config  |
| `state_container_name`       | string                   | Blob container holding state                |
| `state_key`                  | string                   | Per-environment key, e.g. `app/dev.tfstate` |
| locking                      | blob lease               | Native azurerm backend locking              |

- **Relationships**: referenced by `backend.tf` of the main config; produced by `bootstrap/`.
- **Lifecycle**: created once; `prevent_destroy`. Shared across environments (separate keys).

## Entity: Deployment Identity

Cloud/CI identity authorized to plan, apply, publish images, update secrets, deploy revisions (FR-015).

| Field                          | Type          | Notes                                                                                         |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------------------- |
| `app_registration_id`          | string        | Entra app registration (azuread)                                                              |
| `federated_credential_subject` | string        | GitHub OIDC subject (repo + environment scoped)                                               |
| `role_assignments`             | list          | Subscription/RG-scoped RBAC (Contributor on RG, AcrPush, Key Vault Secrets Officer as needed) |
| runtime managed identity       | user-assigned | Used by app/worker/job for ACR pull + Key Vault read                                          |

- **Relationships**: trusted by ACR (pull/push), Key Vault (secret read), resource groups (deploy).
- **Validation**: federated subject scoped to bound which workflow/environment may deploy.

## Entity: Network

| Field                         | Type          | Notes                                                        |
| ----------------------------- | ------------- | ------------------------------------------------------------ |
| `vnet_address_space`          | string (CIDR) | e.g. `10.0.0.0/16`                                           |
| `infra_subnet`                | object        | Delegated subnet for Container Apps Environment (clarify Q2) |
| `db_delegation` / private DNS | object        | PostgreSQL Flexible Server private access                    |
| public ingress                | bool          | Only the app Container App; worker/migration internal        |

- **Relationships**: hosts Runtime set; constrains Database/Registry/Key Vault to VNet-only reachability (FR-021).

## Entity: Runtime Service

Hosted execution unit (app / worker / migration) (spec Key Entity).

| Field                           | Type                         | Notes                                                         |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `kind`                          | enum: app, worker, migration |                                                               |
| `image_ref`                     | Container Image Reference    | app & migration share the app image; worker uses worker image |
| `ingress`                       | enum: external, none         | app=external; worker=none; migration=job (no ingress)         |
| `min_replicas` / `max_replicas` | int                          | app may scale to zero; worker min 1                           |
| `secrets`                       | list(Key Vault ref)          | least-privilege per `kind` (FR-009)                           |
| `env`                           | map                          | `BASE_PATH`, `AUTH_BASE_URL`, runtime DB URL, etc.            |
| `identity`                      | user-assigned MI             | ACR pull + Key Vault read                                     |

- **Lifecycle / state transitions** (FR-005/FR-006): migration Job runs first → on **success** app & worker revisions are promoted → on **failure** revisions are NOT promoted and the failure is surfaced.

## Entity: Container Image Reference

| Field        | Type   | Notes                                                          |
| ------------ | ------ | -------------------------------------------------------------- |
| `registry`   | string | ACR login server                                               |
| `repository` | string | `app`, `worker`                                                |
| `tag`        | string | Explicit per deploy (FR-004); app tag reused for migration Job |

- **Validation / edge case**: a tag may exist for one runtime but not another → deploy input validation checks tag presence before promotion (FR-017).

## Entity: Runtime Secret

| Field           | Type                                 | Notes                                                                                                              |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `name`          | string                               | e.g. `app-database-url`, `worker-database-url`, `migration-database-url`, `betterauth-secret`, integration secrets |
| `owner_runtime` | enum: app, worker, migration, shared | Drives exposure (FR-009)                                                                                           |
| `source`        | string                               | Key Vault secret name                                                                                              |
| `optional`      | bool                                 | Mail/Teams secrets optional when integration disabled (edge case)                                                  |

- **Relationships**: stored in Key Vault (FR-008); referenced by Runtime Service via managed identity.

## Entity: Database (Persistent Data Resource)

| Field                   | Type       | Notes                                                                                       |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `server_name`           | string     | PostgreSQL Flexible Server                                                                  |
| `sku`                   | string     | Burstable default; sized per env via `.tfvars`                                              |
| `databases`             | list       | Application database(s)                                                                     |
| `roles`                 | list       | Distinct app/worker/migration access paths (FR-007)                                         |
| `public_network_access` | bool=false | VNet-only (FR-021)                                                                          |
| `prevent_destroy`       | lifecycle  | Static guard; destructive ops require explicit teardown intent and manual override (FR-013) |

## Entity: Container Registry (shared bootstrap resource)

Single shared ACR created in `bootstrap/` and reused by all environments (same image tag promoted dev→staging→prod; SC-007 shared-bootstrap exemption).

| Field                   | Type                     | Notes                                                            |
| ----------------------- | ------------------------ | ---------------------------------------------------------------- |
| `name`                  | string (globally unique) | ACR (one, in bootstrap)                                          |
| `sku`                   | string                   | Premium (required for private endpoint + disabled public access) |
| `public_network_access` | bool=false               | VNet-only pull via private endpoint (FR-021)                     |
| `pull_principals`       | list                     | Each environment's runtime managed identity (`AcrPull`) (FR-010) |

## Entity: Observability Workspace (Persistent Data Resource)

| Field                        | Type      | Notes                                                                          |
| ---------------------------- | --------- | ------------------------------------------------------------------------------ |
| `log_analytics_workspace_id` | string    | Container Apps log destination                                                 |
| `app_insights_id`            | string    | App telemetry                                                                  |
| `prevent_destroy`            | lifecycle | Operational history loss guard; manual override required for deletion (FR-013) |

## Entity: Environment Output (FR-011)

Values produced by provisioning for operators/CI.

| Output                    | Source                    | Consumer                            |
| ------------------------- | ------------------------- | ----------------------------------- |
| `app_endpoint`            | app Container App FQDN    | operators, BetterAuth origin        |
| `registry_login_server`   | ACR                       | CI image push/pull                  |
| `database_host`           | PostgreSQL FQDN           | runtime config (via Key Vault refs) |
| `log_analytics_workspace` | observability             | operators                           |
| `app_insights_connection` | observability             | app                                 |
| `deployment_identity`     | app registration / MI ids | CI OIDC setup                       |
| `key_vault_uri`           | Key Vault                 | secret management                   |

## Cross-cutting validation inputs (FR-017)

The validation path checks before deploy: required inputs present (project, environment, location, image tags), missing required secrets in Key Vault, image tag existence per runtime, environment-name validity, and secret-environment alignment.
