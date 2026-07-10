# Data Model: DeepSec Remediation

## Security Finding

Represents a scanner-reported vulnerability or bug that needs remediation evidence.

**Fields**

- `id`: Scanner or exported finding identifier.
- `severity`: CRITICAL, HIGH, MEDIUM, HIGH_BUG, BUG, or LOW.
- `category`: Finding category such as secrets exposure, workflow security, denial of service, or race condition.
- `affectedSurface`: User-facing or operational area affected by the finding.
- `status`: unresolved, fixed, accepted-risk, duplicate, false-positive, or deferred.
- `phase`: Phase 1 for HIGH/HIGH_BUG, Phase 2 for MEDIUM/BUG unless naturally fixed earlier.
- `owner`: Person or team responsible for the decision.
- `evidence`: Tests, scanner run IDs, and notes proving the status.

**Validation Rules**

- Phase 1 findings must not remain unresolved at Phase 1 completion.
- Accepted risks require owner, rationale, and review date.
- Fixed findings require local test evidence and refreshed scanner evidence where practical.

## Sanitized Background Job Payload

Represents safe job metadata that can be stored, logged, returned, and rendered.

**Fields**

- `jobId`: Background job identifier.
- `jobType`: Type of background work.
- `ownerId`: User or system owner.
- `status`: queued, running, succeeded, failed, or cancelled.
- `createdAt` / `updatedAt`: Lifecycle timestamps.
- `nonSecretMetadata`: Job parameters safe for operators to inspect.
- `errorCategory`: Non-secret failure classification.
- `redactionState`: not-needed, redacted-on-read, cleaned-at-rest, or cleanup-failed.

**Validation Rules**

- Must not contain access tokens, refresh tokens, bearer credentials, authorization headers, or equivalent delegated secrets.
- Historical records with known sensitive values must be cleaned at rest and remain redacted on read until cleanup is verified.
- Failure messages must not include upstream error payloads verbatim if they may contain secrets.

## Delegated Integration Credential

Represents delegated authorization material used to perform external collaboration work.

**Fields**

- `grantId`: Stable reference to the delegated grant.
- `userId`: User who delegated access.
- `scope`: Authorized external capability.
- `expiresAt`: Expiration time for temporary access.
- `secretMaterial`: Credential value, never part of job payloads, logs, or ordinary responses.

**Validation Rules**

- Ordinary job read surfaces may reference `grantId` or non-secret capability metadata, but never `secretMaterial`.
- Runtime use of secret material must stay inside existing authorization/consent boundaries.

## Platform Administrator Invariant

Represents the required system state that at least one active platform administrator exists.

**Fields**

- `userId`: Administrator user identifier.
- `role`: Administrative role.
- `status`: active or non-active.
- `operation`: role change or status change under evaluation.
- `invariantResult`: allowed or rejected.

**Validation Rules**

- Any completed set of concurrent role/status changes must leave at least one active platform administrator.
- Rejected changes must return a clear non-secret reason.
- The invariant applies to both direct route handlers and shared user-management services.

## Audit Export Request

Represents an administrator request to list or export audit records.

**Fields**

- `requesterId`: Administrator requesting the export.
- `filters`: Search, actor, event type, date range, or other supported filter values.
- `format`: Supported export format.
- `requestedLimit`: Requested number of records or implicit default.
- `effectiveLimit`: Safe maximum actually applied.
- `resultState`: complete, truncated, rejected, or invalid.
- `message`: User-facing truncation or narrowing guidance.

**Validation Rules**

- `effectiveLimit` must never exceed the configured safe maximum.
- Missing, malformed, negative, or extreme pagination inputs must resolve to safe defaults or clear validation errors.
- Truncated exports must tell the requester that results are incomplete or must be narrowed.

## Login Attempt Bucket

Represents rate-limit accounting for login attempts.

**Fields**

- `bucketKey`: Conservative client identity plus any intended login dimensions.
- `trustedProxyMode`: enabled or disabled.
- `identitySource`: direct connection, trusted forwarded header, or fallback.
- `attemptCount`: Count inside the current window.
- `windowExpiresAt`: End of rate-limit window.

**Validation Rules**

- Forwarded client identity can contribute to `bucketKey` only when trusted proxy mode is explicitly enabled.
- Untrusted forwarded headers must not collapse unrelated clients or let attackers bypass throttling.
- Abusive clients must be throttled without unnecessarily blocking unaffected clients.

## Release Automation Boundary

Represents trusted release workflow segments and their permissions.

**Fields**

- `boundary`: validation/build or publishing.
- `permissionScope`: read-only or write-enabled.
- `externalActionRef`: Immutable action reference.
- `releaseToolVersion`: Explicit approved release-tool version.
- `approvalState`: approved, pending, or rejected.

**Validation Rules**

- Validation/build boundary must not have repository write permission.
- Publishing boundary may have write permission only for release publication.
- External automation and release tools in write-enabled paths must be immutable and approved.
