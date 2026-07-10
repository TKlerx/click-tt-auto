# Runtime Credential Fixture: App Has Worker Graph Secret

## Credential Inventory

| Setting               | Owner  | Purpose                     | Required In    | Exception |
| --------------------- | ------ | --------------------------- | -------------- | --------- |
| `APP_DATABASE_URL`    | app    | Runtime app database access | App runtime    |           |
| `GRAPH_CLIENT_SECRET` | worker | Worker mail secret          | Worker runtime |           |

## Runtime Exposures

| Runtime | Setting               | Exception |
| ------- | --------------------- | --------- |
| app     | `APP_DATABASE_URL`    |           |
| app     | `GRAPH_CLIENT_SECRET` |           |
