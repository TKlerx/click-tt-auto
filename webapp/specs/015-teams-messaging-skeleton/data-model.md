# Data Model: Teams Messaging Skeleton

**Feature**: 015-teams-messaging-skeleton
**Date**: 2026-04-26

## New Enums

### TeamsMessageStatus

Tracks lifecycle of outbound Teams messages.

| Value    | Meaning                                 |
| -------- | --------------------------------------- |
| QUEUED   | Job created, awaiting worker pickup     |
| SENDING  | Worker claimed job, sending in progress |
| SENT     | Successfully delivered to Teams         |
| RETRYING | Delivery failed, retry scheduled        |
| FAILED   | Permanently failed after max attempts   |

### TeamsInboundStatus

Tracks processing state of ingested Teams messages.

| Value     | Meaning                              |
| --------- | ------------------------------------ |
| RECEIVED  | Message ingested, not yet processed  |
| PROCESSED | Message processed for downstream use |
| IGNORED   | Message ingested but not actionable  |

## New Models

### TeamsIntegrationConfig

Singleton configuration controlling Teams integration behavior. One row per installation.

| Field           | Type     | Constraints          | Notes                           |
| --------------- | -------- | -------------------- | ------------------------------- |
| id              | String   | @id @default(cuid()) |                                 |
| sendEnabled     | Boolean  | @default(false)      | Independent toggle for outbound |
| intakeEnabled   | Boolean  | @default(false)      | Independent toggle for inbound  |
| updatedByUserId | String?  |                      | Last admin who changed config   |
| createdAt       | DateTime | @default(now())      |                                 |
| updatedAt       | DateTime | @updatedAt           |                                 |

**Relations**: `updatedByUserId` → User (optional, no cascade)

### TeamsDeliveryTarget

Named Teams channel destination for outbound messages.

| Field           | Type     | Constraints          | Notes                         |
| --------------- | -------- | -------------------- | ----------------------------- |
| id              | String   | @id @default(cuid()) |                               |
| name            | String   |                      | Human-readable label          |
| teamId          | String   |                      | Microsoft Graph team ID       |
| channelId       | String   |                      | Microsoft Graph channel ID    |
| teamName        | String?  |                      | Cached display name           |
| channelName     | String?  |                      | Cached display name           |
| active          | Boolean  | @default(true)       | Soft disable without deleting |
| createdByUserId | String   |                      | Admin who created target      |
| createdAt       | DateTime | @default(now())      |                               |
| updatedAt       | DateTime | @updatedAt           |                               |

**Relations**: `createdByUserId` → User
**Indexes**: `@@unique([teamId, channelId])`, `@@index([active])`
**Uniqueness**: One target per team+channel combination.

### TeamsOutboundMessage

Durable record of each outbound Teams delivery attempt.

| Field          | Type                  | Constraints          | Notes                                 |
| -------------- | --------------------- | -------------------- | ------------------------------------- |
| id             | String                | @id @default(cuid()) |                                       |
| targetId       | String                |                      | FK to TeamsDeliveryTarget             |
| eventType      | NotificationEventType |                      | Which event triggered this            |
| eventId        | String?               |                      | FK to NotificationEvent if applicable |
| content        | String                |                      | Message body sent                     |
| contentType    | String                | @default("html")     | "html" or "text"                      |
| truncated      | Boolean               | @default(false)      | Whether content was truncated         |
| status         | TeamsMessageStatus    | @default(QUEUED)     |                                       |
| graphMessageId | String?               |                      | Graph API response message ID         |
| attemptCount   | Int                   | @default(0)          |                                       |
| lastError      | String?               |                      | Last failure reason                   |
| sentAt         | DateTime?             |                      | When successfully sent                |
| createdAt      | DateTime              | @default(now())      |                                       |
| updatedAt      | DateTime              | @updatedAt           |                                       |

**Relations**: `targetId` → TeamsDeliveryTarget, `eventId` → NotificationEvent (optional)
**Indexes**: `@@index([targetId, createdAt])`, `@@index([status, createdAt])`, `@@index([eventType, createdAt])`

### TeamsIntakeSubscription

Approved Teams conversation for read-only message intake.

| Field           | Type      | Constraints          | Notes                                           |
| --------------- | --------- | -------------------- | ----------------------------------------------- |
| id              | String    | @id @default(cuid()) |                                                 |
| teamId          | String    |                      | Microsoft Graph team ID                         |
| channelId       | String    |                      | Microsoft Graph channel ID                      |
| teamName        | String?   |                      | Cached display name                             |
| channelName     | String?   |                      | Cached display name                             |
| active          | Boolean   | @default(true)       | Soft disable                                    |
| deltaToken      | String?   |                      | Graph delta query token for incremental polling |
| lastPolledAt    | DateTime? |                      | Last successful poll timestamp                  |
| createdByUserId | String    |                      | Admin who created subscription                  |
| createdAt       | DateTime  | @default(now())      |                                                 |
| updatedAt       | DateTime  | @updatedAt           |                                                 |

**Relations**: `createdByUserId` → User
**Indexes**: `@@unique([teamId, channelId])`, `@@index([active])`

### TeamsInboundMessage

Durable record of each ingested Teams message.

| Field             | Type               | Constraints          | Notes                            |
| ----------------- | ------------------ | -------------------- | -------------------------------- |
| id                | String             | @id @default(cuid()) |                                  |
| subscriptionId    | String             |                      | FK to TeamsIntakeSubscription    |
| providerMessageId | String             | @unique              | Graph API message ID (dedup key) |
| teamId            | String             |                      | Source team                      |
| channelId         | String             |                      | Source channel                   |
| senderDisplayName | String?            |                      | Teams sender display name        |
| senderUserId      | String?            |                      | Azure AD user ID of sender       |
| content           | String?            |                      | Message body snapshot            |
| contentType       | String?            |                      | "html" or "text"                 |
| truncated         | Boolean            | @default(false)      | Whether content was truncated    |
| processingStatus  | TeamsInboundStatus | @default(RECEIVED)   |                                  |
| processingNotes   | String?            |                      |                                  |
| messageCreatedAt  | DateTime           |                      | When message was posted in Teams |
| createdAt         | DateTime           | @default(now())      |                                  |
| updatedAt         | DateTime           | @updatedAt           |                                  |

**Relations**: `subscriptionId` → TeamsIntakeSubscription
**Indexes**: `@@index([subscriptionId, createdAt])`, `@@index([processingStatus, createdAt])`, `@@index([channelId, messageCreatedAt])`

## Updated Enums

### NotificationEventType (existing)

No changes needed. Outbound Teams messages reuse the existing event types (USER_CREATED, ROLE_CHANGED, etc.). The `TeamsOutboundMessage.eventType` references this enum.

### BackgroundJob.jobType (allowed values — not an enum, string field)

Add to allowed job types in `services/api/background-jobs.ts`:

- `"teams_message_delivery"` — outbound Teams send
- `"teams_intake_poll"` — inbound Teams message polling

## Entity Relationship Diagram

```
TeamsIntegrationConfig (singleton)
    ↓ controls
TeamsDeliveryTarget ←── TeamsOutboundMessage
    (1:many)              ↑ triggered by
                     NotificationEvent (existing)

TeamsIntakeSubscription ←── TeamsInboundMessage
    (1:many, dedup via providerMessageId)
```

## State Transitions

### TeamsOutboundMessage.status

```
QUEUED → SENDING → SENT (success)
                 → RETRYING → SENDING (retry)
                            → FAILED (max attempts)
```

### TeamsInboundMessage.processingStatus

```
RECEIVED → PROCESSED (actionable)
         → IGNORED (not actionable)
```
