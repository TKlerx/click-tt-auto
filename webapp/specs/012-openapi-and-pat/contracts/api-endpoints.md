# API Endpoints Contract: OpenAPI & Personal Access Tokens

**Date**: 2026-04-09

## Token Management API

### POST /api/tokens

Create a new personal access token.

**Auth**: Session only (PATs cannot create PATs)
**Request body**:

```json
{
  "name": "my-script",
  "expiresInDays": 90
}
```

**Validation**:

- `name`: required, 1-100 chars, unique per user
- `expiresInDays`: optional, must be one of [7, 30, 60, 90, 180, 365], default 90

**Response 201**:

```json
{
  "token": {
    "id": "clx...",
    "name": "my-script",
    "tokenValue": "starter_pat_a1b2c3d4e5f6...",
    "tokenPrefix": "a1b2c3d4",
    "type": "PAT",
    "expiresAt": "2026-07-08T00:00:00Z",
    "createdAt": "2026-04-09T10:00:00Z"
  }
}
```

**Note**: `tokenValue` is only returned on creation. Never returned again.

**Error 409**: Token name already exists for this user
**Error 429**: Active token limit reached (default: 10)

---

### GET /api/tokens

List the authenticated user's tokens.

**Auth**: Session or PAT
**Query params**:

- `showAll`: boolean (default: false) â€” include tokens revoked/expired >90 days ago

**Response 200**:

```json
{
  "tokens": [
    {
      "id": "clx...",
      "name": "my-script",
      "tokenPrefix": "a1b2c3d4",
      "type": "PAT",
      "status": "ACTIVE",
      "expiresAt": "2026-07-08T00:00:00Z",
      "lastUsedAt": "2026-04-09T12:00:00Z",
      "revokedAt": null,
      "renewalCount": 0,
      "createdAt": "2026-04-09T10:00:00Z"
    }
  ]
}
```

---

### POST /api/tokens/[id]/revoke

Revoke a token. Token remains in database with REVOKED status.

**Auth**: Session only
**Response 200**:

```json
{
  "token": {
    "id": "clx...",
    "status": "REVOKED",
    "revokedAt": "2026-04-09T14:00:00Z"
  }
}
```

**Error 404**: Token not found or not owned by user
**Error 409**: Token already revoked

---

### POST /api/tokens/[id]/renew

Generate a new token value for an active token, invalidating the old value.

**Auth**: Session only
**Request body**:

```json
{
  "expiresInDays": 90
}
```

**Response 200**:

```json
{
  "token": {
    "id": "clx...",
    "name": "my-script",
    "tokenValue": "starter_pat_x9y8z7w6...",
    "tokenPrefix": "x9y8z7w6",
    "expiresAt": "2026-07-08T00:00:00Z",
    "renewalCount": 1
  }
}
```

**Error 404**: Token not found or not owned by user
**Error 409**: Token is revoked (cannot renew revoked tokens)

---

### DELETE /api/tokens/[id]

Permanently delete a token.

**Auth**: Session only
**Response 204**: No content

**Error 404**: Token not found or not owned by user

---

## Admin Token API

### GET /api/admin/tokens

List all tokens across all users.

**Auth**: Session or PAT, requires PLATFORM_ADMIN role
**Query params**:

- `showAll`: boolean (default: false)
- `userId`: string (optional, filter by user)

**Response 200**:

```json
{
  "tokens": [
    {
      "id": "clx...",
      "name": "my-script",
      "tokenPrefix": "a1b2c3d4",
      "type": "PAT",
      "status": "ACTIVE",
      "expiresAt": "2026-07-08T00:00:00Z",
      "lastUsedAt": "2026-04-09T12:00:00Z",
      "revokedAt": null,
      "renewalCount": 0,
      "createdAt": "2026-04-09T10:00:00Z",
      "user": {
        "id": "clx...",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

---

### POST /api/admin/tokens/[id]/revoke

Admin revoke any user's token. Same response as user revoke.

**Auth**: Session or PAT, requires PLATFORM_ADMIN role

---

### DELETE /api/admin/tokens/[id]

Admin delete any user's token.

**Auth**: Session or PAT, requires PLATFORM_ADMIN role
**Response 204**: No content

---

## CLI Auth API

### GET /api/cli-auth/authorize

Initiate CLI browser login flow.

**Auth**: None (public endpoint)
**Query params**:

- `callback_url`: required, must be `http://localhost:*` or `http://127.0.0.1:*`
- `state`: required, random string for CSRF protection

**Behavior**: Creates a `CliAuthCode` record, stores the callback URL and state, redirects the browser to the login page with a return URL pointing to `/cli-login`.

**Response 302**: Redirect to login page

**Error 400**: Missing or invalid callback_url (not localhost), missing state

---

### POST /api/cli-auth/token

Exchange authorization code for an API token.

**Auth**: None (public endpoint, code is the proof)
**Request body**:

```json
{
  "code": "abc123...",
  "state": "xyz789..."
}
```

**Validation**:

- Code must exist, not be expired (60s), not be exchanged, and have a userId set
- State must match the stored state

**Response 200**:

```json
{
  "token": "starter_pat_a1b2c3d4...",
  "expiresAt": "2026-05-09T00:00:00Z",
  "user": {
    "name": "John Doe",
    "email": "john@example.com",
    "role": "SCOPE_USER"
  }
}
```

**Error 400**: Invalid, expired, or already-exchanged code; state mismatch

---

## OpenAPI API

### GET /api/openapi

Serve the OpenAPI 3.1 YAML specification.

**Auth**: Session or PAT (any authenticated user)
**Response 200**: YAML content with `Content-Type: application/yaml`

**Note**: The `servers` section in the YAML is dynamically set to include the configured base path.

---

## Authentication Headers

All endpoints that accept PAT auth check headers in this order:

1. Session cookie (existing BetterAuth session)
2. `Authorization: Bearer <token>` header
3. `X-API-Key: <token>` header

If multiple are present, the first match wins in the order above.

## Error Response Format

All errors follow the existing pattern:

```json
{
  "error": "Human-readable error message"
}
```

With appropriate HTTP status codes: 400 (bad request), 401 (not authenticated), 403 (not authorized), 404 (not found), 409 (conflict), 429 (limit reached).
