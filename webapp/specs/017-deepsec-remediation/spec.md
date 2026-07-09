# Feature Specification: DeepSec Remediation

**Feature Branch**: `017-deepsec-remediation`
**Created**: 2026-06-01
**Status**: Draft
**Input**: User description: "Fix DeepSec-reported production/runtime security findings: remaining high and high-bug issues around release workflow pinning, delegated Graph token exposure, audit export bounds, login rate-limit keying, and atomic last-admin protections; preserve previously validated auth fixes."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## Clarifications

### Session 2026-06-01

- Q: How should existing background job records that may already contain delegated credentials be handled? → A: Redact on read and clean existing stored sensitive job payloads.
- Q: How should audit export requests above the safe maximum behave? → A: Export up to a safe maximum and clearly indicate truncation or required narrowing.
- Q: How should release workflow permissions be scoped? → A: Split validation and publishing so only the publishing job has write permissions.
- Q: When may login rate limits use forwarded client identity headers? → A: Use forwarded headers only when trusted proxy mode is explicitly enabled.
- Q: Should the remediation scope include lower-severity DeepSec findings? → A: Use one spec with two priorities: Phase 1 fixes HIGH/HIGH_BUG, Phase 2 fixes MEDIUM/BUG in a later task run unless planning shows a split is needed.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Protect Delegated Integration Secrets (Priority: P1)

As an organization administrator, I need delegated integration access tokens to remain hidden from application job lists, job details, logs, and other operator-facing surfaces so that routine monitoring cannot disclose credentials that access external collaboration data.

**Why this priority**: Active delegated access tokens are immediately exploitable if disclosed and were identified as remaining high-severity findings.

**Independent Test**: Can be fully tested by creating or viewing background integration jobs and confirming no delegated access token or equivalent secret value is stored in user-visible job payloads, returned by job APIs, rendered in dashboards, or emitted in logs.

**Acceptance Scenarios**:

1. **Given** an integration job is created with delegated access, **When** an authorized user views job lists or job details, **Then** the response contains only non-secret metadata needed to understand job status.
2. **Given** an integration job fails, **When** failure details are recorded and displayed, **Then** no delegated access token, refresh token, or bearer credential appears in stored payloads, logs, or UI-visible messages.
3. **Given** a user lacks permission to inspect integration jobs, **When** they attempt to access job information, **Then** they receive no job metadata and no indication of hidden secret fields.

---

### User Story 2 - Preserve Administrative Access Invariants (Priority: P1)

As a platform owner, I need administrative role and status changes to always preserve at least one active platform administrator so that concurrent account management actions cannot lock the system out of its own administration surface.

**Why this priority**: Last-admin bypasses can create an unrecoverable operational incident and several remaining high-bug findings point to the same invariant.

**Independent Test**: Can be fully tested by attempting concurrent deactivation and role-change operations against the final active platform administrator and confirming at least one operation is rejected while the invariant remains true.

**Acceptance Scenarios**:

1. **Given** there is exactly one active platform administrator, **When** any user attempts to demote that administrator, **Then** the operation is rejected and the administrator remains active with administrative privileges.
2. **Given** there is exactly one active platform administrator, **When** any user attempts to deactivate that administrator, **Then** the operation is rejected and the administrator remains active with administrative privileges.
3. **Given** two requests concurrently attempt to remove administrative coverage, **When** both complete, **Then** at least one active platform administrator remains.

---

### User Story 3 - Keep Security Controls Available Under Load (Priority: P2)

As a legitimate user, I need login and audit-export workflows to remain available and predictable even when malformed, excessive, or hostile requests are sent, so that security controls cannot be abused to deny service or expose excessive data.

**Why this priority**: Login rate-limit key collapse and unbounded audit export can harm system availability and administrator workflows.

**Independent Test**: Can be fully tested by exercising login attempts and audit export requests from varied client contexts, large audit histories, and malformed pagination inputs while confirming bounded work, stable responses, and correct isolation between clients.

**Acceptance Scenarios**:

1. **Given** multiple legitimate clients attempt login, **When** one client exceeds the allowed attempt threshold, **Then** other clients can still attempt login within their own limits.
2. **Given** trusted proxy mode is not explicitly enabled, **When** login rate limiting is evaluated, **Then** the system ignores ordinary forwarded client identity headers and uses a conservative identity that cannot be spoofed by those headers.
3. **Given** the audit history is larger than a normal export window, **When** an administrator requests an export, **Then** the system exports up to the safe maximum and clearly indicates truncation or the need to narrow the request.
4. **Given** audit pagination parameters are missing, malformed, or extreme, **When** audit data is requested, **Then** the system applies safe bounds and never returns the entire audit history unintentionally.

---

### User Story 4 - Harden Release Publishing (Priority: P2)

As a maintainer, I need release automation to run only trusted, repeatable release steps so that publishing credentials and repository write permissions are not exposed to mutable third-party code.

**Why this priority**: Release automation has write permission and is part of the supply-chain boundary for distributed artifacts.

**Independent Test**: Can be fully tested by reviewing release automation configuration and running a release dry-run that proves every external action or release tool version is immutable, explicit, and scoped to the minimum required permission.

**Acceptance Scenarios**:

1. **Given** release automation is reviewed, **When** external automation steps are identified, **Then** each step is pinned to an immutable version.
2. **Given** release validation and publishing run, **When** validation or build steps execute, **Then** they run separately from publishing and do not receive repository write permissions.
3. **Given** a release tool updates upstream, **When** the release workflow runs, **Then** it continues using the approved version until maintainers intentionally update it.

---

### User Story 5 - Keep Previous Auth Fixes Closed (Priority: P3)

As a security reviewer, I need the recently fixed mock SSO and CLI browser-login issues to remain closed while new remediation work proceeds so that the backlog does not regress already validated fixes.

**Why this priority**: These issues were previously confirmed and fixed; regression would reintroduce account takeover and unauthorized CLI token issuance risk.

**Independent Test**: Can be fully tested by rerunning the relevant security checks and auth-flow tests, confirming fixed findings stay fixed and intended test-only login flows still work.

**Acceptance Scenarios**:

1. **Given** mock SSO is enabled for test use, **When** a request lacks the required test-only authorization material, **Then** the request cannot create or take over a user session.
2. **Given** a CLI login request is awaiting approval, **When** a browser merely loads the approval page, **Then** no CLI token grant is issued until an authenticated user performs an explicit approval action.
3. **Given** a CLI auth code is exchanged more than once or concurrently, **When** exchange attempts complete, **Then** no more than one valid CLI token is issued.

### Edge Cases

- Background jobs created before this remediation may already contain delegated credentials or sensitive payload fields; those records must be redacted on read and cleaned so sensitive payload values do not remain stored.
- Integration failures may include upstream error objects that embed secrets in nested fields or diagnostic text.
- Multiple administrators may remove each other concurrently while another request creates, disables, or changes an administrator.
- Audit export requests may target very large histories, broad date ranges, malformed filters, or unsupported export formats.
- Audit export responses that hit the safe maximum must clearly tell administrators that results were truncated or that narrower filters are required.
- Login requests may arrive through direct clients, trusted proxies, untrusted forwarded headers, missing client metadata, or shared network addresses.
- Forwarded client identity headers may influence login rate limits only when trusted proxy mode is explicitly enabled.
- Release automation may include both first-party and third-party automation steps with different permission needs.
- Release automation must keep validation/build work separate from publishing work so repository write permissions are isolated to publishing.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST prevent delegated integration access tokens and equivalent bearer credentials from being stored in or returned through job payloads, job lists, job details, dashboards, audit entries, or routine logs.
- **FR-002**: System MUST preserve enough non-secret integration job metadata for authorized users to understand job status, ownership, timing, error category, and next action.
- **FR-003**: System MUST handle existing job records that contain sensitive delegated credentials by hiding those fields from all normal read surfaces and cleaning stored sensitive payload values from affected records.
- **FR-004**: System MUST reject any role or status change that would leave the platform without at least one active administrator.
- **FR-005**: System MUST preserve the last-active-administrator invariant even when conflicting administrator updates are submitted concurrently.
- **FR-006**: System MUST produce clear, non-secret failure messages when administrator updates are rejected to preserve administrative coverage.
- **FR-007**: System MUST ensure login rate limiting separates independent clients when reliable client identity is available and MUST use forwarded client identity headers only when trusted proxy mode is explicitly enabled.
- **FR-008**: System MUST keep login available for unaffected legitimate clients when another client exceeds login-attempt limits.
- **FR-009**: System MUST bound audit list and export requests so malformed, omitted, or extreme pagination and filter values cannot unintentionally return or process the complete audit history.
- **FR-010**: System MUST export at most the safe maximum number of audit records and provide a user-understandable indication when results are truncated or the request must be narrowed.
- **FR-011**: System MUST make release publishing repeatable by requiring immutable, approved versions for external release automation and release tooling.
- **FR-012**: System MUST separate release validation/build work from publishing work so repository write permissions are granted only to the publishing job or equivalent publishing boundary.
- **FR-013**: System MUST keep previously fixed mock SSO and CLI browser-login vulnerabilities closed and covered by regression checks.
- **FR-014**: System MUST refresh security-scan evidence after remediation so fixed findings are either absent from unresolved exports or marked fixed.
- **FR-015**: System MUST document any remaining accepted risk separately from fixed vulnerabilities, including owner, rationale, and review date.

### Key Entities

- **Security Finding**: A DeepSec-reported issue with severity, category, affected capability, validation status, owner, and remediation state.
- **Delegated Integration Credential**: A temporary or renewable credential that allows the system to perform external collaboration actions on behalf of a user.
- **Background Job**: A user- or system-visible unit of asynchronous work with status, ownership, timestamps, non-secret payload metadata, and failure details.
- **Platform Administrator**: An active user with privileges needed to manage users, roles, and system configuration.
- **Audit Export Request**: An administrator request for audit records with filters, date range, format, and a bounded result scope.
- **Login Attempt Bucket**: A rate-limit accounting group used to decide whether login attempts should proceed or be throttled.
- **Release Automation Step**: A publishing or validation step that may run third-party automation and may or may not require repository write permission.

### Assumptions

- Remaining unresolved DeepSec findings are covered by this spec in two priorities: Phase 1 fixes HIGH and HIGH_BUG findings; Phase 2 fixes MEDIUM and BUG findings in a later task run unless planning shows a separate spec is needed. Lower-severity findings may also be fixed during Phase 1 when naturally covered by the same change.
- Production and runtime code is the priority; test-only code is in scope only where needed to preserve or verify security behavior.
- Existing user-facing behavior should remain unchanged except where needed to hide secrets, reject unsafe requests, or make overly broad requests explicit.
- Security-scan exports under `.deepsec/` are evidence artifacts and should not define user-facing product behavior.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of unresolved HIGH findings from the refreshed DeepSec export are fixed or explicitly documented as accepted risk with owner and review date.
- **SC-002**: 100% of unresolved HIGH_BUG findings from the refreshed DeepSec export are fixed or explicitly documented as accepted risk with owner and review date.
- **SC-003**: Security validation confirms that job list, job detail, dashboard, and routine log surfaces expose zero delegated access tokens or equivalent bearer credentials.
- **SC-003a**: Historical background job records known to contain delegated credentials are cleaned so sensitive payload values are no longer present in stored job data.
- **SC-004**: Concurrent attempts to remove the final active platform administrator preserve at least one active administrator in 100% of tested runs.
- **SC-005**: Audit list and export workflows never return or process more than the configured safe maximum when requests omit, malform, or exceed bounds, and export users are told when results are truncated or must be narrowed.
- **SC-006**: Login rate limiting throttles abusive clients while at least 95% of unaffected legitimate login attempts continue to receive normal handling during abuse simulations.
- **SC-006a**: Validation confirms ordinary forwarded client identity headers cannot change login rate-limit buckets unless trusted proxy mode is explicitly enabled.
- **SC-007**: Release automation review finds zero mutable third-party action references, zero unpinned release-tool versions, and no repository write permissions outside the publishing boundary.
- **SC-008**: Regression validation confirms previously fixed mock SSO and CLI login findings remain fixed.
- **SC-009**: A refreshed security report shows no unresolved critical findings and no unresolved unactioned high-severity findings in the remediation scope.
- **SC-010**: Phase 2 planning or tasks account for 100% of remaining MEDIUM and BUG findings from the refreshed DeepSec export, either as fixes, accepted risks, duplicates, or explicitly deferred items with owners.
