# Contract: DeepSec Remediation Security Behaviors

This contract describes externally observable behavior that Phase 1 remediation must preserve or introduce.

## Background Job Read Surfaces

**Applies to**: job list APIs, job detail APIs, dashboards, routine logs, and failure display surfaces.

**Contract**

- Responses and rendered views MUST include job status, type, owner, timestamps, and safe metadata.
- Responses and rendered views MUST NOT include delegated access tokens, refresh tokens, bearer credentials, authorization headers, or equivalent secret values.
- Historical records containing sensitive payloads MUST be redacted when read and cleaned from storage.
- Failed cleanup MUST be visible to maintainers through non-secret operational evidence without exposing the secret value.

**Acceptance Evidence**

- Tests prove secret-like fields are absent from job API responses, dashboard data, and logs.
- Cleanup validation proves known sensitive historical payload values are removed or replaced with non-secret markers.

## Administrator Role And Status Changes

**Applies to**: all routes and service helpers that deactivate users or change platform-admin roles.

**Contract**

- A request that would remove the final active platform administrator MUST be rejected.
- Concurrent requests that together would remove administrative coverage MUST leave at least one active platform administrator.
- Rejection responses MUST be clear and non-secret.

**Acceptance Evidence**

- Tests simulate concurrent role/status changes and prove the invariant remains true.
- Tests cover both direct route paths and shared service helper paths.

## Audit Listing And Export

**Applies to**: audit list and export workflows.

**Contract**

- Missing, malformed, negative, or extreme pagination and filter inputs MUST NOT cause a full audit-history read or export.
- Export output MUST contain no more than the safe maximum record count.
- When output is truncated or filters must be narrowed, the response MUST clearly indicate that state.

**Acceptance Evidence**

- Tests cover malformed pagination, broad filters, oversized exports, and normal bounded exports.
- Validation confirms memory-intensive full-result loading is no longer required for broad requests.

## Login Rate Limiting

**Applies to**: login attempt throttling.

**Contract**

- Forwarded client identity headers MUST be ignored unless trusted proxy mode is explicitly enabled.
- When trusted proxy mode is disabled, ordinary request headers cannot choose or spoof another client's rate-limit bucket.
- Abuse from one client MUST NOT unnecessarily block unaffected clients when reliable client identity is available.

**Acceptance Evidence**

- Tests prove forwarded headers do not alter buckets by default.
- Tests prove trusted proxy mode uses forwarded identity only under explicit configuration.

## Release Automation

**Applies to**: release workflow that publishes CLI or repository artifacts.

**Contract**

- Validation/build work MUST run outside the publishing permission boundary.
- Repository write permission MUST be present only for publishing.
- External automation and release tooling MUST be pinned to immutable approved versions.

**Acceptance Evidence**

- Workflow review or automated validation shows no mutable action references and no unpinned release tools in write-enabled publishing paths.
- Release dry-run or workflow validation demonstrates validation can run without repository write permission.

## Previously Fixed Auth Findings

**Applies to**: mock SSO and CLI browser-login approval/exchange flows.

**Contract**

- Test-only mock SSO MUST require explicit test-only authorization material and MUST NOT allow unauthenticated account takeover.
- CLI browser-login approval MUST require an authenticated explicit approval action and CSRF validation.
- CLI auth-code exchange MUST issue no more than one valid token for a code under repeated or concurrent exchange.

**Acceptance Evidence**

- Existing auth regression tests continue to pass.
- Forced DeepSec revalidation keeps these findings fixed or absent from unresolved exports.
