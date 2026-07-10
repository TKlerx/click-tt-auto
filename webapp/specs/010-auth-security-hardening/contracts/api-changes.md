# API Contract Changes: Auth Security Hardening

**Feature**: 010-auth-security-hardening | **Date**: 2026-04-01

This feature modifies the behavior of existing API endpoints. No new endpoints are added.

## Modified Endpoints

### POST /api/auth/login

**Change**: Add rate limiting (5 attempts / 15 min per IP) and audit logging.

**New response** (when rate-limited):

```
HTTP 429 Too Many Requests
Retry-After: <seconds>

{
  "error": "Too many login attempts. Please try again later."
}
```

**Existing responses unchanged**:

- 200: Successful login (now also creates `AUTH_LOGIN_SUCCEEDED` audit entry)
- 401: Invalid credentials (now also creates `AUTH_LOGIN_REJECTED` audit entry)
- 403: Account deactivated (unchanged)

---

### POST /api/auth/change-password

**Change**: Add rate limiting (5 attempts / 15 min per IP) and audit logging.

**New response** (when rate-limited):

```
HTTP 429 Too Many Requests
Retry-After: <seconds>

{
  "error": "Too many attempts. Please try again later."
}
```

**Existing responses unchanged**:

- 200: Password changed (now also creates `AUTH_PASSWORD_CHANGED` audit entry)
- 400: Missing fields / complexity failure (unchanged)
- 401: Current password incorrect (unchanged)

---

### POST /api/auth/logout

**Change**: Add audit logging only.

**Responses unchanged**:

- 200/redirect: Logout success (now also creates `AUTH_LOGOUT_SUCCEEDED` audit entry)

---

### GET /api/auth/sso/azure

**Change**: Mock SSO path blocked in production.

**New behavior**: If `NODE_ENV === "production"`, the `E2E_MOCK_SSO` code path is unreachable regardless of env var value.

**Responses unchanged** for real SSO flow.

---

### GET /api/users

**Change**: Validate `status` query parameter.

**New response** (invalid status filter):

```
HTTP 400 Bad Request

{
  "error": "Invalid status filter. Supported values: PENDING_APPROVAL, ACTIVE, INACTIVE"
}
```

**Existing responses unchanged** for valid or absent status filter.

---

### POST /api/users

**Change**: Add audit logging for user creation.

**Responses unchanged**:

- 201: User created (now also creates `USER_CREATED` audit entry)

---

### PATCH /api/users/[id]/approve

**Change**: Add audit logging.

**Responses unchanged** (now also creates `USER_STATUS_CHANGED` audit entry).

---

### PATCH /api/users/[id]/deactivate

**Change**: Add audit logging.

**Responses unchanged** (now also creates `USER_STATUS_CHANGED` audit entry).

---

### PATCH /api/users/[id]/reactivate

**Change**: Add audit logging.

**Responses unchanged** (now also creates `USER_STATUS_CHANGED` audit entry).

---

### PATCH /api/users/[id]/role

**Change**: Add audit logging.

**Responses unchanged** (now also creates `ROLE_CHANGED` audit entry).

## Rate Limit Headers

All rate-limited responses include:

- `Retry-After`: Seconds until the client can retry (integer)

## Audit Entry Schema

All audit entries follow the existing `AuditEntry` model:

```json
{
  "action": "AUTH_LOGIN_SUCCEEDED | AUTH_LOGIN_REJECTED | AUTH_LOGOUT_SUCCEEDED | AUTH_PASSWORD_CHANGED | USER_CREATED | USER_STATUS_CHANGED | ROLE_CHANGED",
  "entityType": "User",
  "entityId": "<target user ID>",
  "actorId": "<acting user ID>",
  "details": "{ ... action-specific JSON ... }",
  "createdAt": "<ISO timestamp>"
}
```

### Details field by action

| Action                | Details                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| AUTH_LOGIN_SUCCEEDED  | `{ "method": "password" }`                                                    |
| AUTH_LOGIN_REJECTED   | `{ "reason": "invalid_credentials" \| "rate_limited" \| "inactive_account" }` |
| AUTH_LOGOUT_SUCCEEDED | `{}`                                                                          |
| AUTH_PASSWORD_CHANGED | `{}`                                                                          |
| USER_CREATED          | `{ "role": "<role>", "authMethod": "LOCAL" }`                                 |
| USER_STATUS_CHANGED   | `{ "from": "<old_status>", "to": "<new_status>" }`                            |
| ROLE_CHANGED          | `{ "from": "<old_role>", "to": "<new_role>" }`                                |
