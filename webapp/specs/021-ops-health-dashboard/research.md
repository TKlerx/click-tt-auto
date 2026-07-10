# Research: Ops Health Dashboard

## Decision: Use a point-in-time snapshot with manual refresh

**Rationale**: The clarified spec asks for a read-only snapshot captured on page load or manual refresh. This avoids background polling, partial live updates, websocket state, and race conditions while still giving administrators current-enough triage information.

**Alternatives considered**:

- Live auto-refreshing dashboard: rejected for v1 because it adds UI state and repeated health-check load without a stated need.
- Last-known-only dashboard: rejected because core runtime/database/config checks are more useful when evaluated for the current request.

## Decision: Keep access admin-only

**Rationale**: The dashboard exposes operational status and configuration readiness. Even without secrets, this is security-adjacent information and should follow existing platform-admin pages such as background jobs and admin tokens.

**Alternatives considered**:

- Any authenticated user in dev/staging: rejected because environment-specific authorization is easy to misconfigure.
- Public redacted page: rejected because it weakens the security posture for little benefit.

## Decision: Reuse existing health/version/background-job primitives

**Rationale**: The repository already has build metadata, health checks, route authorization, background job data, and admin navigation. Reusing these keeps the implementation small and aligned with current patterns.

**Alternatives considered**:

- New diagnostic subsystem: rejected as premature abstraction.
- New persistent health table: rejected for v1 because the spec only requires recent recorded results when available, not durable monitoring history.

## Decision: Treat worker and deploy smoke evidence as recorded-only

**Rationale**: The dashboard should not trigger deployment smoke checks or worker probes that could mutate state, require external credentials, or take too long. It should summarize recent recorded evidence when the app already has it; otherwise it should say unknown/unavailable.

**Alternatives considered**:

- Active worker/deploy smoke checks from the dashboard: rejected because they blur diagnostics with deployment automation.
- Omit these areas: rejected because unknown/unavailable status is still useful and matches the clarified spec.

## Decision: Use allowlisted diagnostic summary fields with recursive redaction as defense in depth

**Rationale**: The copyable summary is intended for issue reports and incident notes. It should include identifiers and status labels only. Allowlisting prevents accidental secret exposure, while recursive redaction protects any safe-looking structured details that later include sensitive names.

**Alternatives considered**:

- Copy all visible UI text: rejected because future UI detail could accidentally contain sensitive values.
- Downloadable diagnostic file: rejected by clarification; copyable text is enough for v1.

## Decision: No new external dependencies

**Rationale**: Existing React, Next.js, Prisma, next-intl, and lucide-react capabilities are sufficient. The constitution asks to minimize dependencies.

**Alternatives considered**:

- Clipboard helper library or status dashboard package: rejected because the needed behavior is small and native browser clipboard APIs are sufficient for a client component.
