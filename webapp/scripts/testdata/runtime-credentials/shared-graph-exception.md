# Runtime Credential Fixture: Shared Graph Exception

## Credential Inventory

| Setting               | Owner            | Purpose                              | Required In             | Exception |
| --------------------- | ---------------- | ------------------------------------ | ----------------------- | --------- |
| `APP_DATABASE_URL`    | app              | Runtime app database access          | App runtime             |           |
| `GRAPH_CLIENT_SECRET` | shared-exception | Shared small-deployment Graph secret | App and worker runtimes | EX-001    |

## Runtime Exposures

| Runtime | Setting               | Exception |
| ------- | --------------------- | --------- |
| app     | `APP_DATABASE_URL`    |           |
| app     | `GRAPH_CLIENT_SECRET` | EX-001    |

## Exceptions

| ID     | Settings              | Owner          | Rationale                                                   | Compensating Control               | Review Date | Status   |
| ------ | --------------------- | -------------- | ----------------------------------------------------------- | ---------------------------------- | ----------- | -------- |
| EX-001 | `GRAPH_CLIENT_SECRET` | Security owner | Small deployment intentionally reuses one app registration. | Access is documented and reviewed. | 2099-01-01  | accepted |
