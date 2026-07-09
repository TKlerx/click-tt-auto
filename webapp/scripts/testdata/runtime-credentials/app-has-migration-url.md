# Runtime Credential Fixture: App Has Migration URL

## Credential Inventory

| Setting                  | Owner     | Purpose                     | Required In       | Exception |
| ------------------------ | --------- | --------------------------- | ----------------- | --------- |
| `APP_DATABASE_URL`       | app       | Runtime app database access | App runtime       |           |
| `MIGRATION_DATABASE_URL` | migration | Migration database access   | Migration runtime |           |

## Runtime Exposures

| Runtime | Setting                  | Exception |
| ------- | ------------------------ | --------- |
| app     | `APP_DATABASE_URL`       |           |
| app     | `MIGRATION_DATABASE_URL` |           |
