# Runtime Credential Fixture: Expired Exception

## Credential Inventory

| Setting               | Owner            | Purpose             | Required In             | Exception |
| --------------------- | ---------------- | ------------------- | ----------------------- | --------- |
| `GRAPH_CLIENT_SECRET` | shared-exception | Shared Graph secret | App and worker runtimes | EX-OLD    |

## Runtime Exposures

| Runtime | Setting               | Exception |
| ------- | --------------------- | --------- |
| app     | `GRAPH_CLIENT_SECRET` | EX-OLD    |

## Exceptions

| ID     | Settings              | Owner          | Rationale          | Compensating Control | Review Date | Status   |
| ------ | --------------------- | -------------- | ------------------ | -------------------- | ----------- | -------- |
| EX-OLD | `GRAPH_CLIENT_SECRET` | Security owner | Temporary sharing. | Manual review.       | 2000-01-01  | accepted |
