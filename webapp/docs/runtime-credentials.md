# Runtime Credentials

This document maps sensitive runtime settings to the process that should receive them. The goal is to keep production-style app, worker, and migration credentials separate while preserving simple local development.

## Runtime Owners

| Owner             | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| app               | Next.js web runtime for user-facing pages and API routes                                |
| worker            | Python background worker for queued jobs, inbound mail polling, and Teams polling       |
| migration         | Prisma migration and initial-admin seed flow                                            |
| local-development | Developer workstation values that should not be required in production-style deployment |
| shared-exception  | Intentionally shared value with a documented exception                                  |

## Credential Inventory

| Setting                         | Owner             | Purpose                                                     | Required In                                       | Exception |
| ------------------------------- | ----------------- | ----------------------------------------------------------- | ------------------------------------------------- | --------- |
| `APP_DATABASE_URL`              | app               | Runtime app database access                                 | Docker/prod app runtime                           |           |
| `WORKER_DATABASE_URL`           | worker            | Worker job queue and background integration database access | Docker/prod worker runtime                        |           |
| `MIGRATION_DATABASE_URL`        | migration         | Prisma migration and initial-admin seed database access     | Docker/prod migration runtime                     |           |
| `DATABASE_URL`                  | local-development | SQLite local fallback and legacy Prisma compatibility       | Local development, internal service compatibility |           |
| `BETTER_AUTH_SECRET`            | app               | Session signing and Better Auth runtime secret              | App runtime                                       |           |
| `AUTH_BASE_URL`                 | app               | Public origin for auth callbacks and cookie behavior        | App runtime                                       |           |
| `AZURE_AD_CLIENT_ID`            | shared-exception  | Microsoft Entra SSO and current Teams Graph flows           | App and worker runtimes                           | EX-001    |
| `AZURE_AD_CLIENT_SECRET`        | shared-exception  | Microsoft Entra SSO and current Teams Graph flows           | App and worker runtimes                           | EX-001    |
| `AZURE_AD_TENANT_ID`            | shared-exception  | Microsoft Entra tenant for SSO and Teams Graph flows        | App and worker runtimes                           | EX-001    |
| `GRAPH_CLIENT_ID`               | worker            | Graph mail application access                               | Worker runtime                                    |           |
| `GRAPH_CLIENT_SECRET`           | worker            | Graph mail application secret                               | Worker runtime                                    |           |
| `GRAPH_TENANT_ID`               | worker            | Graph mail tenant                                           | Worker runtime                                    |           |
| `MAIL_PROVIDER`                 | worker            | Selects worker mail provider                                | Worker runtime                                    |           |
| `MAIL_DEFAULT_MAILBOX`          | worker            | Shared mailbox used by worker mail jobs                     | Worker runtime                                    |           |
| `TEAMS_ENABLED`                 | shared-exception  | Enables Teams UI controls and worker execution              | App and worker runtimes                           | EX-002    |
| `TEAMS_POLL_INTERVAL_SECONDS`   | worker            | Worker Teams polling cadence                                | Worker runtime                                    |           |
| `WORKER_POLL_INTERVAL_SECONDS`  | worker            | Worker job polling cadence                                  | Worker runtime                                    |           |
| `WORKER_MAX_ATTEMPTS`           | worker            | Worker retry limit                                          | Worker runtime                                    |           |
| `WORKER_RETRY_BACKOFF_SECONDS`  | worker            | Worker retry delay                                          | Worker runtime                                    |           |
| `WORKER_STALE_LOCK_SECONDS`     | worker            | Worker stale-lock recovery threshold                        | Worker runtime                                    |           |
| `INITIAL_ADMIN_EMAIL`           | migration         | Initial admin seed identity                                 | Migration runtime                                 |           |
| `INITIAL_ADMIN_PASSWORD`        | migration         | Initial admin seed credential                               | Migration runtime                                 |           |
| `PAT_TOKEN_PREFIX`              | app               | Personal access token prefix                                | App runtime                                       |           |
| `PAT_DEFAULT_EXPIRY_DAYS`       | app               | Personal access token default lifetime                      | App runtime                                       |           |
| `PAT_MAX_ACTIVE_PER_USER`       | app               | Personal access token per-user limit                        | App runtime                                       |           |
| `CLI_TOKEN_DEFAULT_EXPIRY_DAYS` | app               | CLI browser-login token lifetime                            | App runtime                                       |           |

## Runtime Exposures

| Runtime   | Setting                        | Exception |
| --------- | ------------------------------ | --------- |
| app       | `APP_DATABASE_URL`             |           |
| app       | `DATABASE_URL`                 |           |
| app       | `BETTER_AUTH_SECRET`           |           |
| app       | `AUTH_BASE_URL`                |           |
| app       | `AZURE_AD_CLIENT_ID`           | EX-001    |
| app       | `AZURE_AD_CLIENT_SECRET`       | EX-001    |
| app       | `AZURE_AD_TENANT_ID`           | EX-001    |
| app       | `TEAMS_ENABLED`                | EX-002    |
| worker    | `WORKER_DATABASE_URL`          |           |
| worker    | `DATABASE_URL`                 |           |
| worker    | `AZURE_AD_CLIENT_ID`           | EX-001    |
| worker    | `AZURE_AD_CLIENT_SECRET`       | EX-001    |
| worker    | `AZURE_AD_TENANT_ID`           | EX-001    |
| worker    | `GRAPH_CLIENT_ID`              |           |
| worker    | `GRAPH_CLIENT_SECRET`          |           |
| worker    | `GRAPH_TENANT_ID`              |           |
| worker    | `MAIL_PROVIDER`                |           |
| worker    | `MAIL_DEFAULT_MAILBOX`         |           |
| worker    | `TEAMS_ENABLED`                | EX-002    |
| worker    | `TEAMS_POLL_INTERVAL_SECONDS`  |           |
| worker    | `WORKER_POLL_INTERVAL_SECONDS` |           |
| worker    | `WORKER_MAX_ATTEMPTS`          |           |
| worker    | `WORKER_RETRY_BACKOFF_SECONDS` |           |
| worker    | `WORKER_STALE_LOCK_SECONDS`    |           |
| migration | `MIGRATION_DATABASE_URL`       |           |
| migration | `DATABASE_URL`                 |           |
| migration | `INITIAL_ADMIN_EMAIL`          |           |
| migration | `INITIAL_ADMIN_PASSWORD`       |           |

## Exceptions

| ID     | Settings                                                             | Owner               | Rationale                                                                                                                          | Compensating Control                                                                                                                    | Review Date | Status   |
| ------ | -------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| EX-001 | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | Template maintainer | Current Teams app-permission worker paths reuse the Microsoft identity settings that also support SSO and delegated Teams consent. | Values are explicit in both app and worker env blocks; downstream apps can split Teams credentials when their tenant model supports it. | 2026-11-30  | accepted |
| EX-002 | `TEAMS_ENABLED`                                                      | Template maintainer | The app needs this flag for admin/UI behavior and the worker needs it to decide whether polling should run.                        | Non-secret feature flag only; worker-only cadence remains separate.                                                                     | 2026-11-30  | accepted |

## Production-Style Rules

- App runtime uses `APP_DATABASE_URL`; local development may fall back to `DATABASE_URL`.
- Worker runtime uses `WORKER_DATABASE_URL`; local development may fall back to `DATABASE_URL`.
- Migration and seed flows use `MIGRATION_DATABASE_URL`.
- Docker Compose rejects SQLite file URLs for app, worker, and migration database variables.
- App runtime must not receive `MIGRATION_DATABASE_URL`.
- App runtime must not receive worker-owned `GRAPH_*` mail credentials.
- Migration runtime must not receive app auth or worker integration credentials.
- This work reduces future blast radius. It is not evidence of a current compromise and does not require emergency secret rotation on its own.
