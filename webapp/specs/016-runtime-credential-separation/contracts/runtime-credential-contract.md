# Runtime Credential Contract

This contract defines the target ownership for high-risk runtime settings.

## Runtime Owners

| Owner             | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| app               | Next.js web runtime for user-facing pages and API routes                                |
| worker            | Python background worker for asynchronous jobs, mail polling, and Teams polling         |
| migration         | Migration and seed process with schema/provisioning authority                           |
| local-development | Developer workstation values that should not be required in production-style deployment |
| shared-exception  | Intentionally shared value with owner, rationale, and review date                       |

## Target Database Settings

| Setting                  | Owner             | Purpose                                            | Fallback                                                                      |
| ------------------------ | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `APP_DATABASE_URL`       | app               | Runtime app database access                        | `DATABASE_URL` in local development only                                      |
| `WORKER_DATABASE_URL`    | worker            | Worker job queue and background integration access | `DATABASE_URL` in local development only                                      |
| `MIGRATION_DATABASE_URL` | migration         | Prisma migration and initial seed access           | `DATABASE_URL` during transition only                                         |
| `DATABASE_URL`           | local-development | SQLite or legacy compatibility fallback            | Must not be the only documented production-style setting after implementation |

## Target Integration Settings

| Setting                       | Target Owner | Notes                                                                 |
| ----------------------------- | ------------ | --------------------------------------------------------------------- |
| `AZURE_AD_CLIENT_ID`          | app          | Interactive SSO sign-in                                               |
| `AZURE_AD_CLIENT_SECRET`      | app          | Interactive SSO sign-in secret                                        |
| `AZURE_AD_TENANT_ID`          | app          | Interactive SSO tenant                                                |
| `GRAPH_CLIENT_ID`             | worker       | Mail background access                                                |
| `GRAPH_CLIENT_SECRET`         | worker       | Mail background access secret                                         |
| `GRAPH_TENANT_ID`             | worker       | Mail background access tenant                                         |
| `TEAMS_ENABLED`               | app, worker  | App controls/admin UI and worker execution both need enablement state |
| `TEAMS_POLL_INTERVAL_SECONDS` | worker       | Worker scheduling                                                     |

## Exception Record Format

Each shared exception must use this shape in documentation:

```text
ID:
Settings:
Owner:
Rationale:
Compensating control:
Review date:
Status:
```

## Validation Expectations

- App runtime must not receive `MIGRATION_DATABASE_URL`.
- App runtime must not receive worker-only Graph secrets unless a documented exception exists.
- Worker runtime must not require app-only SSO secrets unless a documented exception exists.
- Migration runtime must not require app-only or worker-only integration secrets.
- Production-style services must fail clearly when their required database URL is missing or points at SQLite.
