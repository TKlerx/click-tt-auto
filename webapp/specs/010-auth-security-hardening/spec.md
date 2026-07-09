# Feature Specification: Auth Security Hardening

**Feature Branch**: `010-auth-security-hardening`  
**Created**: 2026-04-01  
**Status**: Draft  
**Input**: User description: "Tackle the auth review findings by hardening authentication and security: add abuse protection for login and password change, tighten proxy/origin trust, address the unsigned id_token fallback risk, validate user status filters, ensure audit coverage for auth and user-admin events, and align seed/setup behavior with the auth policy."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Protect Account Entry Points (Priority: P1)

As an end user or administrator, I want authentication entry points to resist brute-force and misrouted auth traffic so that accounts cannot be compromised through repeated guessing or unsafe deployment defaults.

**Why this priority**: This directly reduces account takeover risk and deployment-time security mistakes on the highest-risk auth surfaces.

**Independent Test**: Can be fully tested by repeatedly attempting login and password-change actions, and by exercising deployments with missing or untrusted origin settings, while confirming the system blocks or safely constrains those attempts.

**Acceptance Scenarios**:

1. **Given** repeated failed sign-in attempts against the same account or from the same client context, **When** the configured abuse threshold is reached, **Then** further attempts are temporarily rejected with a user-safe response.
2. **Given** repeated password-change attempts against an authenticated account, **When** the configured abuse threshold is reached, **Then** further attempts are temporarily rejected without changing the password.
3. **Given** the application is deployed without an explicit trusted public auth origin, **When** forwarded host or protocol headers are supplied, **Then** the system does not trust them beyond the allowed deployment policy.

---

### User Story 2 - Keep SSO Identity Safe And Predictable (Priority: P2)

As a user signing in through SSO, I want identity resolution and callback handling to fail safely so that I am either signed in correctly or shown a controlled error, never authenticated from unverifiable identity data.

**Why this priority**: SSO errors and fallback paths affect privileged trust decisions and should fail closed rather than accepting unverifiable user identity claims.

**Independent Test**: Can be tested independently by simulating successful SSO, missing configuration, and user-info fallback conditions, then verifying that only trusted identity information results in a session.

**Acceptance Scenarios**:

1. **Given** SSO configuration is incomplete or invalid, **When** a user starts SSO sign-in, **Then** the user is redirected to a controlled failure state instead of leaving the app in a partial auth flow.
2. **Given** the identity provider cannot supply verified profile information, **When** the app cannot confirm user identity safely, **Then** sign-in is denied and no session is created.
3. **Given** a non-production test-only SSO shortcut exists, **When** the app is running in a production-style environment, **Then** that shortcut cannot be used.

---

### User Story 3 - Keep Admin Actions Auditable And Consistent (Priority: P3)

As a platform administrator or security reviewer, I want sensitive auth and user-management actions to be validated consistently and recorded in the audit trail so that operational reviews and incident investigations have trustworthy evidence.

**Why this priority**: This improves correctness and traceability for shared admin workflows without blocking the most urgent auth-surface protections above.

**Independent Test**: Can be tested independently by performing user creation, login, password change, approval, reactivation, deactivation, and role change flows, then verifying validation and audit records.

**Acceptance Scenarios**:

1. **Given** an administrator filters users by status, **When** an unsupported status value is supplied, **Then** the request is rejected as invalid input instead of failing internally.
2. **Given** a successful or failed sensitive auth or user-admin action, **When** the action completes, **Then** the system records an audit entry with the actor, action type, target, and timestamp.
3. **Given** the initial admin password is set during setup, **When** the setup process accepts that credential, **Then** it is held to the same password policy expected elsewhere in the product.

---

### Edge Cases

- What happens when a legitimate user hits the abuse threshold shortly after a real typo streak and then corrects the password? → They must wait the full 15-minute cooldown; the correct password is not accepted until the window expires.
- What happens when the app is copied from the template without production proxy settings being explicitly configured?
- How does the system behave when SSO profile retrieval partially succeeds but identity cannot be verified to the required level of trust?
- What happens when a status filter is omitted, malformed, or uses outdated values after a future enum change?
- How does the audit trail behave if the primary action succeeds but audit persistence fails? → The primary action succeeds; the audit failure is logged to the application error log (log-and-continue).

## Clarifications

### Session 2026-04-01

- Q: What constitutes "actor context" for rate limiting scope? → A: Per IP address only.
- Q: What are the specific rate limit thresholds and time window? → A: 5 attempts per 15-minute window.
- Q: Where is rate limit state stored? → A: In-memory (per-process Map/object, resets on restart).
- Q: What happens when the primary action succeeds but audit persistence fails? → A: Log-and-continue (action succeeds, audit failure logged to application error log).
- Q: How long is the rate limit cooldown before a blocked IP can retry? → A: 15 minutes (matches the window duration).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST limit repeated login attempts per IP address to 5 attempts within a 15-minute sliding window and temporarily reject further attempts for 15 minutes after the threshold is reached.
- **FR-002**: The system MUST limit repeated password-change attempts per IP address to 5 attempts within a 15-minute sliding window and temporarily reject further attempts for 15 minutes after the threshold is reached.
- **FR-003**: Temporary abuse protections MUST return user-safe responses that do not reveal whether a specific account exists. Rate limit state is stored in-memory per process and resets on server restart.
- **FR-004**: The system MUST require an explicit trusted public auth origin for deployments that rely on reverse-proxy forwarding and MUST NOT accept arbitrary forwarded host or protocol values outside that policy.
- **FR-005**: The system MUST deny SSO sign-in whenever the user identity cannot be verified to the same trust level as the normal SSO flow.
- **FR-006**: The system MUST ensure any test-only SSO shortcut is unavailable in production-oriented environments.
- **FR-007**: The system MUST validate supported user-status filter values before processing user-list requests and return a client error for unsupported values.
- **FR-008**: The system MUST record audit entries for successful and failed login attempts.
- **FR-009**: The system MUST record audit entries for password changes.
- **FR-010**: The system MUST record audit entries for user approval, reactivation, deactivation, and role changes.
- **FR-011**: Audit entries for auth and user-admin actions MUST capture the actor, action type, target entity, and event timestamp.
- **FR-012**: The setup flow for the initial administrator account MUST enforce the same minimum password policy used for other password-setting flows.
- **FR-013**: The system MUST keep the existing generic error behavior for incorrect login credentials.
- **FR-014**: The system MUST preserve the current product behavior where deactivated users are treated as unauthenticated and pending users are held outside the main dashboard.

### Assumptions

- Abuse protection may be temporary rather than permanent account lockout, provided it materially slows repeated guessing.
- Existing user-facing login and password-change flows remain in place; this feature hardens them rather than redesigning them.
- Audit visibility continues to be limited to platform-administrator review surfaces.
- Seed/setup remains an operator-run flow rather than a public self-service experience.

### Key Entities _(include if feature involves data)_

- **Authentication Attempt Record**: A security record describing a successful, failed, or rate-limited sign-in or password-change attempt, keyed by IP address, including the outcome and 15-minute sliding window used for abuse protection. Stored in-memory (per-process); state resets on server restart.
- **Trusted Auth Origin Policy**: A deployment-level rule describing which externally visible auth origin is allowed to generate callback and redirect URLs.
- **Audit Entry**: A historical record of a sensitive auth or user-management action, including actor, action type, target entity, scope when relevant, and timestamp. Audit writes use a log-and-continue strategy: if persistence fails, the primary action still succeeds and the failure is logged to the application error log.
- **User Status Filter**: A constrained input used by administrators to narrow user-list results to supported status values only.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Repeated invalid login attempts from the same actor context are blocked before unlimited guessing is possible during a single short attack window.
- **SC-002**: Repeated password-change attempts from the same actor context are blocked before unlimited guessing is possible during a single short attack window.
- **SC-003**: SSO sign-in succeeds only when the application can establish trusted identity data; unverifiable fallback identity data results in no authenticated session.
- **SC-004**: Invalid user-status filter values are rejected with a client error in 100% of tested cases rather than producing internal server errors.
- **SC-005**: Security review can confirm that each tested login attempt, password change, approval, reactivation, deactivation, and role change produces an audit record with actor, target, action, and timestamp.
- **SC-006**: A fresh environment setup rejects an initial administrator password that does not satisfy the shared password policy in 100% of tested cases.
