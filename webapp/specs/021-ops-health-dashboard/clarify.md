# Clarifications: Ops Health Dashboard

**Feature Branch**: `021-ops-health-dashboard`
**Date**: 2026-06-11
**Spec**: [spec.md](./spec.md)

## Session 2026-06-11

The clarification pass resolved the following product and implementation boundaries before planning and task generation:

1. **Access model**: The first version is admin-only. Developers use administrator accounts in dev/staging when they need the operational view.
2. **Refresh model**: Health data is a read-only point-in-time snapshot captured when the dashboard opens or when an administrator manually refreshes it.
3. **Navigation placement**: The dashboard belongs in the existing admin/ops area navigation.
4. **Worker and smoke evidence**: Show recent recorded worker/deploy smoke status when available; otherwise report unknown or unavailable.
5. **Diagnostic sharing**: Include a copyable non-secret summary in the first version.

## Applied Spec Changes

- Added clarifications to [spec.md](./spec.md).
- Kept the dashboard read-only and administrator-scoped.
- Kept optional worker/deploy smoke signals evidence-based rather than active probes.
- Required diagnostic output to avoid secrets, cookies, auth headers, private keys, passwords, and full connection strings.
