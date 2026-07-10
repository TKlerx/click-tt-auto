# Data Model: API Route Refactor

**Feature**: 011-route-refactor | **Date**: 2026-04-01

## Existing Persisted Entities (no schema changes planned)

This feature is a service-layer refactor. The current starter does not require Prisma schema changes for the planned work.

### User

| Field              | Type                   | Notes                                                        |
| ------------------ | ---------------------- | ------------------------------------------------------------ |
| id                 | String                 | Primary identifier used by all user-admin routes             |
| email              | String                 | Unique login identifier; used by auth and managed-user flows |
| name               | String                 | Returned in auth and admin responses                         |
| role               | `Role` enum            | Drives admin-only route access and last-admin protections    |
| status             | `UserStatus` enum      | Drives approval, deactivate, and reactivate flows            |
| authMethod         | `AuthMethod` enum      | Used by login and password-change logic                      |
| mustChangePassword | Boolean                | Returned by login/change-password flows                      |
| themePreference    | `ThemePreference` enum | Updated by `/api/users/[id]/theme`                           |
| createdAt          | DateTime               | Returned by `/api/users`                                     |

**Relevant transitions**:

- `PENDING_APPROVAL -> ACTIVE` via `approve`
- `ACTIVE -> INACTIVE` via `deactivate`
- `INACTIVE -> ACTIVE` via `reactivate`
- `role` changes must preserve at least one non-inactive `PLATFORM_ADMIN`
- `themePreference` may only be changed by the user who owns the record

### Account

| Field      | Type    | Notes                              |
| ---------- | ------- | ---------------------------------- |
| providerId | String  | Used to locate credential accounts |
| accountId  | String  | Lowercased email for local auth    |
| password   | String? | Required for password-change flow  |

### AuditEntry

| Field      | Type               | Notes                            |
| ---------- | ------------------ | -------------------------------- |
| id         | String             | Primary key                      |
| action     | `AuditAction` enum | Filtered by audit routes         |
| entityType | String             | Included in audit/export queries |
| entityId   | String             | Route-specific audit target      |
| actorId    | String             | Acting user                      |
| details    | String (JSON)      | Route-specific audit metadata    |
| createdAt  | DateTime           | Used in filtering/export         |

### BackgroundJob

| Field                 | Type        | Notes                             |
| --------------------- | ----------- | --------------------------------- |
| id                    | String      | Primary key                       |
| jobType               | String      | User-supplied job identifier      |
| status                | String/enum | Returned to callers               |
| payload               | String      | Serialized JSON payload           |
| result                | String?     | Serialized JSON result            |
| error                 | String?     | Failure detail                    |
| createdByUserId       | String      | Visibility depends on caller role |
| createdAt / updatedAt | DateTime    | Returned in API responses         |

## New Service-Layer Entities (code-only)

### RouteAuthContext

Reusable route guard result for authenticated routes.

| Field | Type          | Validation / Meaning                                |
| ----- | ------------- | --------------------------------------------------- |
| user  | `User` subset | User must be authenticated and not pending approval |
| error | `Response`    | Present only when auth or role checks fail          |

### ManagedUserContext

Reusable admin route context for routes that mutate or inspect another user record.

| Field | Type             | Validation / Meaning                                  |
| ----- | ---------------- | ----------------------------------------------------- |
| actor | `{ id: string }` | Must be a `PLATFORM_ADMIN`                            |
| user  | `User`           | Must exist in the database                            |
| error | `Response`       | `403` for auth failure, `404` for missing target user |

### UserStatusMutationInput

Represents the shared state transition options already implicit in `updateManagedUserStatus`.

| Field                | Type          | Validation / Meaning                   |
| -------------------- | ------------- | -------------------------------------- |
| nextStatus           | `UserStatus`  | Required target status                 |
| requireCurrentStatus | `UserStatus?` | Optional guard for allowed transition  |
| blockedMessage       | string?       | Existing route-specific 400 message    |
| lastAdminMessage     | string?       | Existing last-admin protection message |
| afterUpdate          | callback?     | Optional route-specific audit hook     |

### AuditFilterInput

Shared representation of audit list/export filters.

| Field      | Type                  | Validation / Meaning                    |
| ---------- | --------------------- | --------------------------------------- |
| action     | `AuditAction \| null` | Validate against enum when provided     |
| entityType | `string \| null`      | Preserve current passthrough behavior   |
| scopeId    | `string \| null`      | Preserve current passthrough behavior   |
| actorId    | `string \| null`      | Preserve current passthrough behavior   |
| dateFrom   | `Date \| null`        | Derived from query string when supplied |
| dateTo     | `Date \| null`        | Derived from query string when supplied |
| page       | `number?`             | Used by audit list route only           |
| limit      | `number?`             | Used by audit list route only           |

### BackgroundJobRequestContext

Shared orchestration input for the background jobs route.

| Field         | Type    | Validation / Meaning                     |
| ------------- | ------- | ---------------------------------------- |
| requesterId   | string  | Authenticated caller                     |
| requesterRole | `Role`  | Determines list visibility               |
| jobType       | string  | Required, trimmed input for create       |
| payload       | unknown | Serialized as JSON without shape changes |

## Relationships

```text
User 1:N AuditEntry        (actorId)
User 1:N BackgroundJob     (createdByUserId)
User 1:N Account           (credential account used by local auth)

RouteAuthContext -> User
ManagedUserContext -> actor User + target User
UserStatusMutationInput -> ManagedUserContext + optional audit hook
AuditFilterInput -> AuditEntry query/export services
BackgroundJobRequestContext -> BackgroundJob list/create services
```

## Future Extension Placeholders (documented, not implemented here)

The feature spec references shared document-version mutations and AI request orchestration. Those domain models do not exist in this starter today, so this plan records their intended shape without creating schema or code prematurely.

### DocumentVersionMutation (future)

| Field       | Meaning                               |
| ----------- | ------------------------------------- |
| documentId  | Parent document identifier            |
| content     | Next version content                  |
| versionNote | Route-specific note                   |
| actorId     | Audit actor                           |
| auditHook   | Optional post-transaction side effect |

**Rule**: Any future implementation must create the new version and update the parent document inside a Prisma `$transaction`.

### AIRequestOrchestration (future)

| Field       | Meaning                                       |
| ----------- | --------------------------------------------- |
| operation   | Analysis vs. rewrite operation key            |
| documentId  | Target document                               |
| requesterId | Authenticated actor                           |
| dedupeKey   | Operation-specific in-flight uniqueness check |
| payload     | Operation-specific job payload                |

**Rule**: Any future implementation must preserve route-specific rate-limit, dedupe, and enqueue behavior rather than normalizing all AI flows into one opaque abstraction.
