# Research: DeepSec Remediation

## Decision: Treat Phase 1 As A Security-Finding Closure Slice

**Decision**: Phase 1 fixes all unresolved HIGH and HIGH_BUG findings from the refreshed DeepSec export, while Phase 2 covers MEDIUM and BUG findings under the same spec.

**Rationale**: The clarified spec needs one coherent remediation program but the risk and review pressure differ by severity. Splitting by priority keeps Phase 1 shippable and lets lower-severity issues be planned without blocking urgent closure.

**Alternatives considered**:

- Fix every unresolved finding in one implementation pass. Rejected because it increases review size and delays high-risk fixes.
- Create a second spec for lower-severity findings immediately. Rejected because the user prefers one spec with two task runs unless planning later shows a split is cleaner.

## Decision: Redact And Clean Stored Background Job Secrets

**Decision**: Job read surfaces must redact sensitive payload fields, and existing stored job payloads that contain delegated credentials must be cleaned.

**Rationale**: Read-time redaction prevents immediate disclosure, but stored cleanup is needed so historical bearer credentials do not remain persisted and rediscoverable through future code paths, backups, or diagnostics.

**Alternatives considered**:

- Redact on read only. Rejected because it leaves known sensitive values at rest.
- Delete affected jobs entirely. Rejected because it destroys operational history that can be preserved safely after cleaning.

## Decision: Keep Delegated Credentials Out Of Job Payloads

**Decision**: Background jobs should store references and non-secret metadata rather than delegated Graph access tokens or equivalent bearer credentials.

**Rationale**: Job payloads are visible through APIs, dashboards, test fixtures, logs, and failure reporting. A job record is not an appropriate secret boundary. Runtime code should resolve delegated access through the existing integration grant path when work is executed.

**Alternatives considered**:

- Encrypt secrets inside job payloads. Rejected for Phase 1 because read surfaces still need careful redaction and this adds key-management complexity.
- Continue storing tokens but filter more response fields. Rejected because it leaves too many accidental disclosure paths.

## Decision: Preserve Last-Admin Invariant Atomically

**Decision**: Role and status changes that could remove the final active platform administrator must enforce that invariant atomically across concurrent requests.

**Rationale**: Non-atomic count-then-update checks are vulnerable to races. The user-facing invariant is absolute: after any set of concurrent admin changes completes, at least one active platform administrator remains.

**Alternatives considered**:

- Keep existing pre-checks and add retries. Rejected because retries do not guarantee invariant preservation.
- Add a manual break-glass recovery flow first. Deferred because it does not replace the need to prevent avoidable lockout.

## Decision: Bound Audit Export With Truncation/Narrowing Feedback

**Decision**: Audit list/export operations must cap work at a safe maximum, return at most that maximum, and clearly indicate when results were truncated or filters must be narrowed.

**Rationale**: This prevents full-table reads and memory exhaustion while preserving a useful export path for administrators.

**Alternatives considered**:

- Reject all over-limit exports. Rejected because bounded partial export is more operationally useful.
- Allow large exports after confirmation. Rejected for Phase 1 because it still permits resource-heavy requests and adds extra UI flow.

## Decision: Trust Forwarded Login Identity Only In Trusted Proxy Mode

**Decision**: Forwarded client identity headers may influence login rate-limit buckets only when trusted proxy mode is explicitly enabled.

**Rationale**: Untrusted forwarded headers are spoofable and can collapse or bypass rate limiting. Direct deployments and trusted-proxy deployments need different trust boundaries.

**Alternatives considered**:

- Ignore all forwarded headers. Rejected because it can unfairly collapse clients behind trusted reverse proxies.
- Trust forwarded headers by default. Rejected because it lets ordinary clients spoof rate-limit identity.

## Decision: Split Release Validation From Publishing

**Decision**: Release validation/build work should run separately from publishing, and repository write permission should exist only in the publishing boundary. External actions and release tooling must use immutable approved versions.

**Rationale**: Mutable actions or `latest` tooling in a write-scoped job are supply-chain risks. Splitting read-only validation from write-scoped publishing reduces blast radius and makes review simpler.

**Alternatives considered**:

- Keep one job and reduce permissions step-by step. Rejected because job-level permission inheritance remains easy to misread and harder to audit.
- Pin only actions but keep `latest` release tooling. Rejected because tooling supply-chain drift remains.

## Decision: Use DeepSec Revalidation As Evidence, Not As The Only Test

**Decision**: Each Phase 1 fix must have local automated regression coverage and refreshed DeepSec evidence.

**Rationale**: DeepSec is valuable at catching semantic security failures, but local tests keep invariants cheap to run and prevent regressions before scanner runs.

**Alternatives considered**:

- Depend only on DeepSec revalidation. Rejected because it is slower and more expensive.
- Depend only on local tests. Rejected because the findings were produced by semantic scanner analysis and should be closed in that evidence trail.
