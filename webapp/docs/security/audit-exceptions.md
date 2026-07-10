# Supply-Chain Audit Exceptions

Audit exceptions are tracked as repository-controlled structured records so validation can determine whether a High/Critical finding is allowed to proceed.

## Required Fields

| Field          | Type   | Required | Rule                                                                            |
| -------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `id`           | string | Yes      | Stable identifier for the exception.                                            |
| `finding_id`   | string | Yes      | CVE, GHSA, PYSEC, or advisory id covered by the exception.                      |
| `artifact`     | string | Yes      | Exact artifact name, such as `app`, `worker`, `migrate`, `infra`, or `compose`. |
| `package_name` | string | Yes      | Exact package or configuration target covered.                                  |
| `owner`        | string | Yes      | Accountable person or team.                                                     |
| `reason`       | string | Yes      | Human-readable justification.                                                   |
| `approved_at`  | date   | Yes      | Date exception was approved.                                                    |
| `review_by`    | date   | Yes      | Must be no later than 30 days after `approved_at`.                              |
| `expires_at`   | date   | No       | Optional hard expiry.                                                           |
| `status`       | string | Yes      | `active`, `expired`, or `revoked`.                                              |

## Matching Rules

- A finding is excepted only when `finding_id`, `artifact`, and `package_name` all match.
- A matching exception must have `status = active`.
- `review_by` must not be in the past.
- `expires_at`, when present, must not be in the past.
- Exceptions cannot apply to all High or all Critical findings.

## Example

```json
{
  "id": "AUDIT-2026-001",
  "finding_id": "CVE-2026-12345",
  "artifact": "worker",
  "package_name": "example-package",
  "owner": "platform",
  "reason": "No fixed version is available; worker route is not externally exposed and package is not used on attacker-controlled input.",
  "approved_at": "2026-06-20",
  "review_by": "2026-07-20",
  "status": "active"
}
```
