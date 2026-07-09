# Feature Specification: Teams Messaging Skeleton

**Feature Branch**: `015-teams-messaging-skeleton`  
**Created**: 2026-04-23  
**Status**: Draft  
**Input**: User description: "Do you think it would make sense to add teams functionality? So maybe, to send and/or receive messages via teams? Just as a skeleton"

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Send Operational Messages To Teams (Priority: P1)

A platform administrator can configure a Teams destination and send outbound operational messages from the application to Teams so important events reach collaboration channels without relying only on email.

**Why this priority**: Outbound delivery provides immediate business value and is the least risky first slice for a skeleton rollout.

**Independent Test**: Can be fully tested by configuring one Teams destination, triggering one supported event, and confirming the expected message appears in the configured Teams destination with a delivery record.

**UI Location**: Settings → Integrations → Teams

**Acceptance Scenarios**:

1. **Given** a platform administrator has saved a valid Teams destination, **When** a supported notification event occurs, **Then** an outbound Teams message is queued and delivered to that destination.
2. **Given** Teams delivery is globally disabled, **When** a notification event occurs, **Then** no Teams message is sent and the event continues without Teams-side failure.

---

### User Story 2 - Read Teams Conversation Updates In A Controlled Scope (Priority: P2)

A platform administrator can enable read-only intake for selected Teams conversations so the system can collect messages for future workflow automation without replying or mutating Teams content.

**Why this priority**: Read capability is needed for receive-side value, but should remain constrained in the skeleton to reduce compliance and operational risk.

**Independent Test**: Can be fully tested by enabling intake for one approved Teams conversation and confirming new messages are ingested and visible in application records without any outbound reply.

**Acceptance Scenarios**:

1. **Given** read-only intake is enabled for an approved Teams conversation, **When** a new Teams message is posted there, **Then** the message is captured as an inbound record in the application.
2. **Given** read-only intake is not enabled for a conversation, **When** messages are posted in that conversation, **Then** those messages are not ingested by the system.

---

### User Story 3 - Manage Teams Integration Safety Controls (Priority: P3)

A platform administrator can view Teams integration status, delivery outcomes, and intake state so they can audit behavior and quickly disable the integration if issues occur.

**Why this priority**: Operational safety and visibility are required for a responsible rollout, but can follow after baseline send/receive paths.

**Independent Test**: Can be fully tested by reviewing integration status and recent activity, then disabling Teams integration and verifying no additional Teams sends or reads occur.

**Acceptance Scenarios**:

1. **Given** Teams integration is active, **When** an administrator views integration management, **Then** they can see current enablement status, configured destinations, and recent delivery/intake outcomes.
2. **Given** an administrator disables Teams integration, **When** new eligible events or messages occur, **Then** Teams sends and reads stop until re-enabled.

---

### Edge Cases

- When the configured Teams destination is invalid, deleted, or inaccessible at send time: retry up to 3 attempts at a fixed interval, then mark as permanently failed and surface the failure to administrators in the integration status view.
- Duplicate inbound reads from retries or polling overlap are prevented via unique constraint on `providerMessageId` (Graph message ID). Duplicates are silently skipped.
- When tenant permissions are insufficient for one capability (send or read) but available for the other, each capability degrades independently. Permission errors are surfaced in the admin status view.
- When message content exceeds the Teams 28KB limit, outbound messages are truncated with an ellipsis marker and the `truncated` flag is set in the delivery record. Inbound messages exceeding 64KB store a truncated preview.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST allow platform administrators to enable or disable Teams integration independently from existing email notifications.
- **FR-002**: The system MUST allow platform administrators to configure at least one Teams delivery target for outbound messages.
- **FR-003**: The system MUST send outbound Teams messages for configured event types when Teams delivery is enabled.
- **FR-004**: The system MUST record outbound Teams delivery attempts and outcomes, including timestamp, target, and status.
- **FR-005**: The system MUST support read-only intake for explicitly approved Teams conversations.
- **FR-006**: The system MUST ingest new messages only from conversations explicitly approved for intake.
- **FR-007**: The system MUST prevent duplicate inbound message records when the same Teams message is observed more than once.
- **FR-008**: The system MUST store inbound Teams messages with enough context to trace source conversation, sender identity, and receipt time.
- **FR-009**: The system MUST provide administrators with a view of Teams integration health, including recent send and read failures.
- **FR-010**: The system MUST allow administrators to disable Teams sending and Teams intake independently as emergency controls.
- **FR-011**: The system MUST not modify, delete, or reply to Teams messages as part of this skeleton scope.
- **FR-012**: The system MUST preserve existing notification behavior when Teams integration is unconfigured or disabled.

### Key Entities _(include if feature involves data)_

- **Teams Integration Configuration**: Administrative settings that control whether Teams sending and Teams intake are globally enabled or disabled.
- **Teams Delivery Target**: A named Teams destination approved for outbound messaging, including identifier, active status, and ownership metadata for auditing.
- **Teams Outbound Message Record**: A durable record of each attempted Teams send, with payload summary, destination, attempt time, and outcome.
- **Teams Intake Subscription**: A controlled mapping of approved Teams conversations that are allowed for read-only intake.
- **Teams Inbound Message Record**: A durable record of each ingested Teams message, including conversation reference, sender reference, content snapshot, and receipt metadata.

### Assumptions

- Platform administrators are the only user type allowed to configure or control Teams integration behavior in this feature.
- Outbound Teams delivery begins with a small set of operational notification events and can expand later.
- Initial receive capability is read-only and intended for future workflow triggers, not for user-facing chat responses.
- Inbound message intake uses periodic polling via Microsoft Graph API (no webhook/subscription endpoint required for skeleton scope).

### Dependencies

- A Microsoft Teams tenant and app registration that permits approved send and read capabilities. The existing Azure AD app registration (used for SSO) is extended with Graph API permissions for Teams — credentials are already in environment variables.
- Microsoft Graph API as the integration mechanism, using application permissions for sending messages (app identity, not user impersonation).
- A thin `TeamsClient` abstraction layer to decouple callers from the Graph SDK, enabling future migration to Bot Framework without upstream changes.
- Existing background processing and notification pipelines remain available for Teams delivery and intake scheduling.
- Existing operational monitoring surfaces can display additional integration status signals.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 95% of outbound Teams notifications for supported event types are delivered to configured destinations within 2 minutes during normal operations.
- **SC-002**: 100% of outbound Teams delivery failures are visible to administrators in the integration status view within 1 minute of failure.
- **SC-003**: For approved intake conversations, at least 95% of new Teams messages are ingested within 5 minutes, with no more than 1 duplicate record per 1,000 ingested messages.
- **SC-004**: In pilot usage, administrators can complete Teams integration setup (enablement plus one outbound target) in under 10 minutes without engineering support.

## Clarifications

### Session 2026-04-23

- Q: Which integration mechanism for Teams connectivity? → A: Microsoft Graph API with application permissions (app identity), wrapped in a thin TeamsClient abstraction layer to allow future migration to Bot Framework.
- Q: How should inbound Teams messages be received? → A: Polling — background job periodically fetches new messages from approved conversations via Graph API. No public endpoint needed.
- Q: Retry behavior on failed outbound delivery? → A: Up to 3 attempts at fixed interval, then permanent fail surfaced to admin. No exponential backoff for skeleton scope.
- Q: Where does Teams configuration UI live? → A: Dedicated subsection under Settings → Integrations → Teams.
- Q: How are Graph API credentials stored? → A: Environment variables — reuse existing Azure AD app registration credentials already configured for SSO.

### Session 2026-04-27

- Q: Why is ChannelMessage.Send not visible under Application permissions? -> A: This permission is delegated-only in Microsoft Graph.
- Q: How should outbound Teams channel sends be authorized? -> A: Add an admin-triggered delegated OAuth consent flow and send on behalf of the consenting administrator.
- Q: Does inbound polling change? -> A: No, inbound polling remains application-permission based and independent from delegated send consent.
