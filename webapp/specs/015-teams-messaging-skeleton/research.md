# Research: Teams Messaging Skeleton

**Feature**: 015-teams-messaging-skeleton
**Date**: 2026-04-26

## R1: Microsoft Graph API for Teams Channel Messaging

**Decision**: Use Microsoft Graph API v1.0 with application permissions (no user delegation) for sending messages to Teams channels and reading messages from channels.

**Rationale**: Spec already mandates Graph API. Application permissions allow the worker to operate without user sessions. The existing `graph.ts` mail client demonstrates the token caching and HTTP call patterns — Teams endpoints follow the same Graph API conventions.

**Key endpoints**:

- Send to channel: `POST /teams/{team-id}/channels/{channel-id}/messages`
- List channel messages: `GET /teams/{team-id}/channels/{channel-id}/messages` (with `$top` and delta query)
- Required permissions: `ChannelMessage.Send`, `ChannelMessage.Read.All` (application)

**Alternatives considered**:

- Bot Framework: More complex, requires bot registration, webhook endpoint. Overkill for skeleton scope. TeamsClient abstraction keeps this as future migration path.
- Power Automate / Webhooks: Incoming webhooks are simpler for send-only but don't support read. Deprecated path for new integrations.
- Delegated permissions: Would require user sign-in flow for each operation. Not suitable for background worker.

## R2: Credential Reuse — Extending Azure AD App Registration

**Decision**: Extend the existing Azure AD app registration (used for SSO) with additional Graph API permissions for Teams. No new app registration needed.

**Rationale**: Spec clarification confirms credential reuse. The existing env vars (`AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`) already hold the client credentials. The token endpoint is the same. Only the requested scopes change.

**New env vars needed**:

- `TEAMS_ENABLED` — feature flag (default: `false`)
- `TEAMS_POLL_INTERVAL_SECONDS` — intake polling frequency (default: `60`)

**No new credentials needed** — existing Azure AD app registration gets additional API permissions in Azure portal.

## R3: Outbound Message Delivery Pattern

**Decision**: Follow the existing notification delivery pattern — create a `BackgroundJob` with type `teams_message_delivery`, worker picks it up and calls Graph API.

**Rationale**: Proven pattern from spec 014. Worker already handles `notification_delivery` jobs with retry logic (3 attempts, configurable backoff). Teams delivery needs identical semantics: queue → claim → send → record outcome.

**Payload structure** (BackgroundJob.payload):

```json
{
  "teamsOutboundMessageId": "cuid",
  "targetId": "cuid",
  "teamId": "graph-team-id",
  "channelId": "graph-channel-id",
  "content": "message body (HTML or text)",
  "contentType": "html"
}
```

**Retry**: 3 attempts at fixed interval (from worker config `WORKER_RETRY_BACKOFF_SECONDS`). Permanent fail after max attempts, surfaced in admin status view.

## R4: Inbound Message Intake Pattern

**Decision**: Follow the existing `inbound_mail_poll` pattern — periodic `teams_intake_poll` background job fetches new messages from approved conversations via Graph API.

**Rationale**: Spec clarification mandates polling (no webhooks). The mail poll pattern in `main.py` (lines 59–172) demonstrates: list messages → check duplicates → store new records. Teams intake follows the same flow with Teams-specific fields.

**Deduplication**: Use Graph message ID (`message.id`) as `providerMessageId` with unique constraint. Same approach as `InboundEmail.providerMessageId`. Target: <1 duplicate per 1,000 messages (SC-003).

**Delta query**: Use Graph delta queries (`/messages/delta`) to fetch only new messages since last poll. Store delta token per subscription for efficient polling.

## R5: Teams Message Size and Formatting

**Decision**: Truncate outbound messages to 28KB (Teams limit is ~28KB for HTML content). Strip unsupported formatting. Log truncation in delivery record.

**Rationale**: Edge case from spec. Teams channels support HTML subset (bold, italic, links, lists). No Adaptive Cards in skeleton scope. If content exceeds limit, truncate with ellipsis marker and record truncation in outbound message record.

**Inbound**: Store raw content snapshot (text + HTML) up to 64KB. Larger messages store truncated preview with flag.

## R6: Independent Send/Read Controls

**Decision**: Two boolean flags in integration config: `sendEnabled` and `intakeEnabled`. Each independently toggleable. Disabling either immediately stops the corresponding background jobs.

**Rationale**: FR-010 requires independent emergency controls. Worker checks flag before processing each job. If disabled mid-flight, job completes but no new jobs are created.

**Implementation**: `TeamsIntegrationConfig` model with `sendEnabled` and `intakeEnabled` booleans. API and UI expose both as independent toggles.

## R7: Admin Status and Health View

**Decision**: Aggregate recent delivery/intake outcomes into a status dashboard showing: integration enabled state, last successful send/read timestamps, recent failure count, and last 20 activity records.

**Rationale**: FR-009 and SC-002 require admin visibility. Follows the pattern of existing notification admin view (`services/notifications/admin.ts`). Query recent `TeamsOutboundMessage` and `TeamsInboundMessage` records with status filters.

**No separate health-check endpoint** — status is served by the same API route that returns integration config, enriched with computed health metrics.
