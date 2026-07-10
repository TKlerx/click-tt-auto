# Phase 1 Findings Inventory

Source: `.deepsec/findings-full-codex.json` (refreshed exports from 2026-06-01)

## Scope

Phase 1 covers unresolved `HIGH` and `HIGH_BUG` findings.

## Current Inventory

| Severity | File                                         | Run ID                            | Finding                                                                      |
| -------- | -------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| HIGH     | `.github/workflows/cli-release.yml`          | `20260601084233-332931d2a7717998` | Release workflow runs unpinned actions with write-scoped token               |
| HIGH     | `src/app/api/background-jobs/route.ts`       | `20260601084233-332931d2a7717998` | Background job listing can expose delegated Microsoft Graph access tokens    |
| HIGH     | `src/services/api/background-jobs.ts`        | `20260601084233-332931d2a7717998` | Background job listing exposes delegated Graph access tokens                 |
| HIGH     | `src/services/teams/service.ts`              | `20260601084233-332931d2a7717998` | Delegated Graph access token is stored in exposed background job payloads    |
| HIGH_BUG | `src/app/api/audit/export/route.ts`          | `20260601084609-09b0e461657d94fb` | Audit export loads the full result set into memory                           |
| HIGH_BUG | `src/app/api/auth/login/route.ts`            | `20260601084609-09b0e461657d94fb` | Default login rate-limit key can collapse all clients into one global bucket |
| HIGH_BUG | `src/app/api/users/[id]/deactivate/route.ts` | `20260601084609-09b0e461657d94fb` | Last-admin protection can be bypassed by concurrent deactivations            |
| HIGH_BUG | `src/app/api/users/[id]/role/route.ts`       | `20260601084609-09b0e461657d94fb` | Last-admin protection can be bypassed by concurrent role changes             |
| HIGH_BUG | `src/lib/user-management.ts`                 | `20260601084609-09b0e461657d94fb` | Last platform-admin guard is enforced non-atomically                         |
| HIGH_BUG | `src/services/api/user-admin.ts`             | `20260601084609-09b0e461657d94fb` | Concurrent admin changes can bypass the last-admin guard                     |

## Notes

- Total unresolved Phase 1 findings currently listed: **10**.
- US1 maps to the delegated token exposure cluster.
- US2 maps to the atomic last-admin invariant cluster.
- US3 maps to audit export and login rate-limit resilience.
- US4 maps to release workflow pinning and write-permission isolation.
