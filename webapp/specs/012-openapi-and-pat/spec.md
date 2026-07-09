# Feature Specification: OpenAPI Specification & Personal Access Tokens

**Feature Branch**: `012-openapi-and-pat`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "Add an OpenAPI 3.1 YAML specification for all existing API endpoints and implement Personal Access Token (PAT) authentication for programmatic API access."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## Clarifications

### Session 2026-04-09

- Q: What token format structure should be used? â†’ A: Prefixed format (`<PREFIX>_<random>`), with the prefix configurable via `.env`.
- Q: How should revoked/expired tokens be handled over time? â†’ A: Auto-hide in the UI after 90 days, with a "show all" toggle. Never auto-delete from the database (audit trail preserved).
- Q: Where should PAT management live in the UI? â†’ A: Under the user's profile/account settings page (new section or tab). Admin token management is a separate view in the admin panel.
- Q: Who can access the API documentation page? â†’ A: Any authenticated user regardless of role (not public, not role-restricted).
- Q: How is the CLI browser login flow protected against CSRF? â†’ A: CLI generates a random `state` parameter, includes it in the authorization request, and validates it on callback (standard OAuth2 pattern).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Create and Use a Personal Access Token (Priority: P1)

A user who wants to automate tasks (e.g., via scripts or a CLI tool) navigates to their account settings, creates a new personal access token with a descriptive name, and receives the token value once. They copy it and use it in an `Authorization: Bearer <token>` header to call any API endpoint they have permission to access. The token inherits their current role and permissions.

**Why this priority**: Without PATs, there is no programmatic access to the API. This is the foundational capability that enables all automation and CLI usage.

**Independent Test**: Can be fully tested by creating a PAT in the UI, then calling `/api/users` with the token in a Bearer header and verifying the response matches the user's permissions.

**Acceptance Scenarios**:

1. **Given** an active user is logged in, **When** they navigate to the PAT management section in their profile/account settings and create a new token with name "my-script", **Then** the system displays the full token value exactly once, and the token appears in their token list (with masked value).
2. **Given** a user has a valid PAT, **When** they send a request to `/api/users` with `Authorization: Bearer <token>`, **Then** they receive the same response as if they were logged in via session, consistent with their role.
3. **Given** a user has a valid PAT, **When** they send a request to an admin-only endpoint and they are not an admin, **Then** they receive a 403 Forbidden response.
4. **Given** a user creates a PAT, **When** the creation is complete, **Then** the token value is never retrievable again from the system (only shown once at creation time).

---

### User Story 2 - Manage Personal Access Tokens (Priority: P1)

A user views their list of tokens (active, revoked, and expired), sees token names, creation dates, last-used dates, expiration dates, and status. They can revoke a token to immediately disable it while keeping a record that it existed. They can delete a token to permanently remove it. They can also renew a token to generate a new secret value with a fresh expiration, keeping the same token name and entry.

**Why this priority**: Token lifecycle management is essential for security. Users must be able to revoke compromised tokens immediately, and renew expiring tokens without disrupting their workflow.

**Independent Test**: Can be tested by creating tokens, revoking one (verifying it stops working but remains visible), renewing another (verifying the old value stops working and a new value is issued), and deleting one (verifying it disappears from the list).

**Acceptance Scenarios**:

1. **Given** a user has 3 active tokens, **When** they view the token management page, **Then** they see all 3 tokens with names, creation dates, last-used dates (or "never"), expiration status, and current status (active/revoked/expired).
2. **Given** a user revokes a token, **When** they attempt to use the revoked token in an API call, **Then** they receive a 401 Unauthorized response. The token remains visible in the list with status "revoked" and the revocation date.
3. **Given** a user deletes a token, **When** they view the token management page, **Then** the token is no longer listed. It is permanently removed.
4. **Given** a user renews an active token, **When** the renewal completes, **Then** the system generates a new token value (displayed once), resets the expiration based on the user's chosen duration, and the previous token value immediately stops working.
5. **Given** a user has reached the active token limit, **When** they attempt to create another token, **Then** the system informs them of the limit and suggests revoking or deleting an existing token. Revoked tokens do not count toward the active token limit.
6. **Given** a token is revoked, **When** the user attempts to renew it, **Then** the system rejects the renewal (only active tokens can be renewed).

---

### User Story 3 - Browse API Documentation (Priority: P2)

A developer or integrator accesses a documentation page that displays all available API endpoints, their methods, parameters, request/response schemas, and authentication requirements. The documentation is always up to date with the current API surface.

**Why this priority**: API documentation is critical for adoption of the programmatic API, but the API itself (via PATs) must work first.

**Independent Test**: Can be tested by navigating to the documentation page and verifying all known endpoints are listed with correct methods and descriptions.

**Acceptance Scenarios**:

1. **Given** a user navigates to the API documentation page, **When** the page loads, **Then** all API endpoint groups (auth, users, audit, background-jobs, health, locale) are listed with their methods and descriptions.
2. **Given** the API documentation page is loaded, **When** a user expands an endpoint, **Then** they see request parameters, request body schema, response schemas, and authentication requirements.
3. **Given** the OpenAPI specification has been updated to include a new endpoint, **When** the documentation page is accessed, **Then** the new endpoint appears with correct method, parameters, and schemas.

---

### User Story 4 - CLI Browser Login Flow (Priority: P2)

A developer using the CLI runs a login command. The server provides a temporary authorization endpoint that the CLI can redirect to. After the user authenticates in their browser (via the existing login page), the server redirects the browser to a localhost callback URL provided by the CLI, delivering a short-lived authorization code. The CLI exchanges this code for an API token that it stores locally. This enables a seamless "just log in" experience without manually creating and copying PATs.

**Why this priority**: This is the primary interactive authentication method for the CLI. It leverages the existing login infrastructure and provides the best developer experience for day-to-day CLI usage.

**Independent Test**: Can be tested by initiating a CLI auth request, completing browser login, and verifying the CLI receives a valid token that authenticates API requests.

**Acceptance Scenarios**:

1. **Given** a CLI sends an authorization request with a localhost callback URL, **When** the server receives it, **Then** the server redirects the user's browser to the existing login page with the callback context preserved.
2. **Given** a user completes authentication in the browser, **When** the login succeeds, **Then** the server redirects the browser to the CLI's localhost callback URL with a temporary authorization code.
3. **Given** a CLI receives an authorization code via its localhost callback, **When** it exchanges the code with the server's token endpoint, **Then** the server returns an API token with the same permissions as the authenticated user.
4. **Given** the authorization code has already been used or has expired (after 60 seconds), **When** a CLI attempts to exchange it, **Then** the server rejects the request.
5. **Given** a user denies or cancels the browser login, **When** the browser redirects back, **Then** the CLI receives an error and displays a clear message.
6. **Given** the application is deployed behind a reverse proxy with a base path, **When** a CLI initiates the browser login flow, **Then** all authorization and callback URLs correctly include the base path.
7. **Given** a user chooses to authenticate via Azure SSO on the login page during the CLI browser flow, **When** the SSO completes, **Then** the server redirects to the CLI's localhost callback with an authorization code, without requiring any Entra-side configuration for localhost.

---

### User Story 5 - Authenticate via API Key Header (Priority: P3)

A user or system integration sends requests using an `X-API-Key` header as an alternative to the Bearer token format. This supports integrations or tools that prefer API key-style authentication over Bearer tokens.

**Why this priority**: This is a convenience alternative to Bearer auth. Bearer token support is the primary mechanism; API key header support broadens compatibility.

**Independent Test**: Can be tested by sending a request with `X-API-Key: <token>` header and verifying the response is identical to using `Authorization: Bearer <token>`.

**Acceptance Scenarios**:

1. **Given** a user has a valid PAT, **When** they send a request with `X-API-Key: <token>`, **Then** they receive the same response as with `Authorization: Bearer <token>`.
2. **Given** both `Authorization: Bearer` and `X-API-Key` are provided in a request, **When** the system processes the request, **Then** the `Authorization: Bearer` header takes precedence.

---

### User Story 6 - Admin Manages All Tokens (Priority: P3)

A platform admin can view all tokens (active, revoked, expired) across all users, see which user owns each token, and revoke or delete any token. This supports security incident response and user offboarding.

**Why this priority**: Admin oversight is important for security governance but is not needed for initial adoption.

**Independent Test**: Can be tested by logging in as admin, viewing the admin token list, revoking another user's token, and verifying it stops working but remains visible. Then deleting it and verifying it disappears.

**Acceptance Scenarios**:

1. **Given** a platform admin navigates to the admin token management page, **When** the page loads, **Then** they see all tokens across all users with owner names, creation dates, last-used dates, and status (active/revoked/expired).
2. **Given** a platform admin revokes another user's token, **When** the affected user attempts to use that token, **Then** they receive a 401 Unauthorized response. The token remains visible with status "revoked".
3. **Given** a platform admin deletes another user's token, **When** the affected user views their token list, **Then** the token is no longer listed.
4. **Given** a user's account is deactivated, **When** any of their tokens are used in an API call, **Then** all requests are rejected with 401 Unauthorized.

---

### Edge Cases

- What happens when a user's role changes after a PAT was issued? The PAT reflects the user's current role at request time, not the role at token creation time.
- What happens when a user's account is deactivated? All their PATs immediately stop working.
- What happens when an expired token is used? The system returns 401 with a clear error message indicating the token has expired.
- What happens when a malformed or unknown token is provided? The system returns 401 without revealing whether the token format was wrong or the token was simply unknown.
- What happens when the token limit per user is reached? The system prevents creation and suggests revoking or deleting existing tokens. Revoked tokens don't count toward the limit.
- What happens when a user tries to renew a revoked token? The system rejects the request â€” only active tokens can be renewed.
- What happens when a user renews a token that is currently in use by a script? The old token value immediately stops working. The user must update the script with the new value.
- Can a revoked token be un-revoked? No. If the user needs the token again, they should create a new one or renew a different active token.
- How does rate limiting work for PAT-authenticated requests? The same rate limits apply as for session-authenticated requests, keyed by user identity.
- What happens when multiple CLI login attempts are in progress simultaneously? Each authorization request is independent; completing one does not invalidate others.
- What happens when the CLI's localhost callback server is not running when the browser redirects? The browser shows a connection error; the user can retry with a new login attempt.
- What happens when the app is behind a reverse proxy with a base path? All authorization and token endpoints include the base path. The OpenAPI spec reflects the full proxied URL.
- What happens when a user authenticates via Azure SSO during the CLI browser login flow? The flow works transparently: browser -> server login page -> Azure SSO -> Entra callback to server -> server redirects to CLI's localhost. The CLI never interacts with Entra directly.
- What happens when a CLI login token (30-day default) expires? The CLI receives a 401 and prompts the user to run `cli login` again.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow authenticated users to create personal access tokens with a user-provided name and a user-chosen expiration (from a set of options: 7 days, 30 days, 60 days, 90 days, 180 days, 1 year). Default: 90 days. Maximum: 1 year.
- **FR-002**: System MUST display the full token value exactly once at creation time and never again.
- **FR-003**: System MUST allow users to list their own tokens showing name, creation date, last-used date, expiration date, masked token prefix, and status (active, revoked, expired). Revoked and expired tokens are auto-hidden after 90 days, with a "show all" toggle to reveal them. Tokens are never auto-deleted from the database.
- **FR-004**: System MUST allow users to revoke any of their own active tokens immediately. Revoked tokens stop authenticating but remain visible in the token list with their revocation date for audit purposes.
- **FR-004a**: System MUST allow users to delete any of their own tokens (active or revoked) permanently, removing them from the token list entirely.
- **FR-004b**: System MUST allow users to renew any of their own active tokens. Renewal generates a new token value (shown once), resets the expiration to a user-chosen duration, and immediately invalidates the previous token value. The token name and entry are preserved.
- **FR-005**: System MUST authenticate API requests that include a valid, non-expired, non-revoked PAT in the `Authorization: Bearer <token>` header.
- **FR-006**: System MUST authenticate API requests that include a valid PAT in the `X-API-Key: <token>` header as an alternative.
- **FR-007**: System MUST enforce the same RBAC permissions for PAT-authenticated requests as for session-authenticated requests, based on the token owner's current role.
- **FR-008**: System MUST reject PAT-authenticated requests if the token owner's account is inactive or pending approval.
- **FR-009**: System MUST serve an OpenAPI 3.1 specification that documents all API endpoints, including methods, parameters, request/response schemas, and authentication requirements.
- **FR-010**: System MUST maintain an OpenAPI specification that accurately documents all API routes. The specification is hand-maintained and MUST be updated as part of any task that adds or modifies API endpoints.
- **FR-011**: System MUST provide a browsable API documentation page accessible to any authenticated user regardless of role (not public, not role-restricted).
- **FR-012**: Platform admins MUST be able to view, revoke, and delete tokens belonging to any user.
- **FR-013**: System MUST enforce a maximum number of active tokens per user (default: 10). Revoked and expired tokens do not count toward this limit.
- **FR-014**: System MUST record token usage (last-used timestamp) on each authenticated request.
- **FR-015**: System MUST log PAT creation, revocation, renewal, deletion, and authentication events in the audit trail.
- **FR-016**: System MUST store tokens securely using one-way hashing (only the hash is persisted; the plaintext is shown once at creation).
- **FR-016a**: Tokens MUST use a prefixed format: `<PREFIX>_<random>` (e.g., `starter_pat_a1b2c3...`). The prefix is configurable via an environment variable (`.env`). This makes tokens identifiable, greppable in configs, and detectable by leaked credential scanners.
- **FR-017**: System MUST provide an authorization endpoint that accepts a localhost callback URL and a `state` parameter from a CLI client, and redirects to the existing login page. The `state` parameter MUST be returned unchanged in the callback redirect for CSRF protection.
- **FR-018**: System MUST redirect the browser to the CLI's localhost callback URL with a temporary, single-use authorization code after successful login.
- **FR-019**: System MUST provide a token exchange endpoint where a CLI can trade a valid authorization code for an API token.
- **FR-020**: System MUST expire unused authorization codes after 60 seconds and reject reuse of already-exchanged codes.
- **FR-021**: Tokens issued via the browser login flow MUST behave identically to PATs for API authentication and RBAC enforcement.
- **FR-022**: All token and authorization endpoints MUST respect the application's configured base path, ensuring correct operation behind a reverse proxy (e.g., nginx).
- **FR-023**: The browser login flow MUST work when the user authenticates via Azure AD SSO (Entra). The SSO callback remains between the browser and the server; the CLI's localhost callback is only used after the server has completed authentication. No additional Entra app registration callback URLs are required.
- **FR-024**: The OpenAPI specification MUST include the configured base path in all endpoint URLs so that API consumers can use the documented URLs directly against a reverse-proxied deployment.
- **FR-025**: CLI login tokens MUST have a separate default expiration of 30 days (distinct from PAT default of 90 days), configurable by platform admins.

### Key Entities

- **PersonalAccessToken**: Represents a user-created token for programmatic API access. Key attributes: name, hashed token value, display prefix (first N characters of the prefixed token for identification), owning user, creation date, expiration date, last-used date, status (active/revoked/expired), revocation date (if revoked), renewal count. Token format: `<configurable_prefix>_<random>` (e.g., `starter_pat_a1b2c3...`).
- **OpenAPI Specification**: A machine-readable document describing all API endpoints, their inputs, outputs, and authentication requirements.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can create a personal access token and successfully authenticate an API request within 2 minutes of account login.
- **SC-002**: Revoking a token takes effect immediately; subsequent requests with the revoked token are rejected within 1 second. The revoked token remains visible in the management UI with its revocation date.
- **SC-002a**: Renewing a token invalidates the old value and provides a new value in a single user action, with zero downtime between the two operations.
- **SC-003**: All existing API endpoints (auth, users, audit, background-jobs, health, locale) are documented in the API specification with correct methods, parameters, and schemas.
- **SC-004**: The API documentation page loads and displays all endpoints within 3 seconds.
- **SC-005**: PAT-authenticated requests enforce identical permissions to session-authenticated requests, with zero privilege escalation scenarios.
- **SC-006**: Deactivating a user account immediately invalidates all their active tokens.
- **SC-007**: The OpenAPI specification accurately documents all API endpoints and is updated alongside any API changes.
- **SC-008**: A CLI can complete the browser login flow (initiate, browser auth, callback, token exchange) in under 30 seconds of user interaction.

## Assumptions

- PAT expiration defaults to 90 days. Users choose from preset options (7d, 30d, 60d, 90d, 180d, 1y). Maximum: 1 year. No "never expires" option.
- CLI login tokens default to 30 days expiration. Both defaults are configurable by platform admins.
- The maximum number of active tokens per user is 10 (configurable).
- The API documentation page is only accessible to authenticated users (not public).
- PATs cannot be used to create other PATs (token creation requires an active session).
- The existing session-based authentication continues to work unchanged for browser clients.
- Token names must be unique per user but need not be globally unique.
- The OpenAPI specification is served as both a YAML file endpoint and a rendered documentation UI.
- The browser login flow only accepts localhost callback URLs (not arbitrary redirect URIs) for security.
- The application's existing base path support is leveraged for all new endpoints. No additional reverse proxy configuration is needed beyond what the app already requires.
- Azure SSO (Entra) works with the browser login flow without additional app registration changes. The Entra callback URL points at the server, not at the CLI's localhost.
