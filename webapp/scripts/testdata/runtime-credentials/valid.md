# Runtime Credential Fixture: Valid

## Credential Inventory

| Setting                  | Owner             | Purpose                              | Required In             | Exception |
| ------------------------ | ----------------- | ------------------------------------ | ----------------------- | --------- |
| `APP_DATABASE_URL`       | app               | Runtime app database access          | App runtime             |           |
| `WORKER_DATABASE_URL`    | worker            | Worker database access               | Worker runtime          |           |
| `MIGRATION_DATABASE_URL` | migration         | Migration database access            | Migration runtime       |           |
| `DATABASE_URL`           | local-development | Local fallback                       | Local development       |           |
| `AZURE_AD_CLIENT_SECRET` | shared-exception  | Current shared Teams identity secret | App and worker runtimes | EX-001    |

## Runtime Exposures

| Runtime   | Setting                  | Exception |
| --------- | ------------------------ | --------- |
| app       | `APP_DATABASE_URL`       |           |
| worker    | `WORKER_DATABASE_URL`    |           |
| migration | `MIGRATION_DATABASE_URL` |           |
| worker    | `AZURE_AD_CLIENT_SECRET` | EX-001    |

## Exceptions

| ID     | Settings                 | Owner          | Rationale                                       | Compensating Control                         | Review Date | Status   |
| ------ | ------------------------ | -------------- | ----------------------------------------------- | -------------------------------------------- | ----------- | -------- |
| EX-001 | `AZURE_AD_CLIENT_SECRET` | Security owner | Current Teams worker flow shares this identity. | Explicit runtime exposure and future review. | 2099-01-01  | accepted |
