# Data Model: Auth Security Hardening

**Feature**: 010-auth-security-hardening | **Date**: 2026-04-01

## Existing Entities (no schema changes)

This feature does **not** add or modify any Prisma models. All changes operate on existing models and in-memory state.

### AuditEntry (existing — no changes)

Already defined in `prisma/schema.prisma` with all required fields:

| Field      | Type                 | Notes                                                                                                                               |
| ---------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| id         | String (CUID)        | Primary key                                                                                                                         |
| action     | AuditAction (enum)   | Already includes: AUTH_LOGIN_SUCCEEDED, AUTH_LOGIN_REJECTED, AUTH_LOGOUT_SUCCEEDED, USER_CREATED, ROLE_CHANGED, USER_STATUS_CHANGED |
| entityType | String               | e.g., "User", "Session"                                                                                                             |
| entityId   | String               | Target entity ID                                                                                                                    |
| actorId    | String (FK → User)   | Who performed the action                                                                                                            |
| scopeId    | String? (FK → Scope) | Optional scope context                                                                                                              |
| details    | String (JSON)        | Serialized additional context                                                                                                       |
| createdAt  | DateTime             | Event timestamp                                                                                                                     |

### AuditAction Enum (existing — may need additions)

Current values:

- `USER_CREATED`, `ROLE_CHANGED`, `SCOPE_ASSIGNMENT_CHANGED`
- `USER_STATUS_CHANGED`, `USER_THEME_CHANGED`
- `AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGIN_REJECTED`
- `AUTH_LOGOUT_SUCCEEDED`, `AUDIT_EXPORT_REQUESTED`

**Potentially needed additions**:

- `AUTH_PASSWORD_CHANGED` — for password change events (FR-009)
- `AUTH_RATE_LIMITED` — optional, for rate-limit trigger events (could use details field on AUTH_LOGIN_REJECTED instead)

**Decision**: Add `AUTH_PASSWORD_CHANGED` to the enum. Rate-limited attempts can be logged as `AUTH_LOGIN_REJECTED` with `{ reason: "rate_limited" }` in the details field — no new enum value needed.

## New In-Memory State (not persisted)

### RateLimitEntry (in-memory Map)

```typescript
type RateLimitEntry = {
  count: number; // Number of attempts in current window
  windowStart: number; // Timestamp (ms) when the current window began
};

// Storage: Map<string, RateLimitEntry>
// Key format: "{endpoint}:{ipAddress}" (e.g., "login:192.168.1.1")
```

| Property    | Type   | Description                             |
| ----------- | ------ | --------------------------------------- |
| count       | number | Attempts in current 15-minute window    |
| windowStart | number | `Date.now()` at first attempt in window |

**Lifecycle**:

- Created on first attempt from an IP to a rate-limited endpoint
- Incremented on subsequent attempts within the window
- Reset when `Date.now() - windowStart > 15 * 60 * 1000`
- Cleaned up by periodic sweep (every 5 minutes) removing expired entries
- Lost on server restart (acceptable per clarification)

## Entity Relationships

```
User ──1:N──► AuditEntry (via actorId)
  │
  └── Referenced as entityId in audit entries for:
      - Login attempts (success/failure/rate-limited)
      - Password changes
      - Status changes (approve/deactivate/reactivate)
      - Role changes
      - User creation

RateLimitEntry (in-memory, no DB relationship)
  └── Keyed by endpoint + IP address
  └── No FK to User (rate limiting is pre-authentication)
```

## Migration Requirements

**Prisma migration needed**: Only if `AUTH_PASSWORD_CHANGED` is added to the `AuditAction` enum.

- Add `AUTH_PASSWORD_CHANGED` to the `AuditAction` enum in `prisma/schema.prisma`
- Run `pnpm exec prisma migrate dev --name add-password-changed-audit-action`
- SQLite: enum changes are handled by Prisma's adapter (stored as strings)
- PostgreSQL: requires an `ALTER TYPE` migration (Prisma handles this automatically)
