# Data Model: Shared Mailbox Notifications

**Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)

## Phase 1 Runtime Models

Phase 1 introduces service-layer models only. No database schema changes are required for the Graph mailbox abstraction.

### MailAddress

Represents a mailbox participant.

| Field     | Type                  | Constraints | Notes                       |
| --------- | --------------------- | ----------- | --------------------------- |
| `address` | `string`              | Required    | SMTP address                |
| `name`    | `string \| undefined` | Optional    | Display name when available |

### MailBody

Represents a message body.

| Field         | Type               | Constraints | Notes                                 |
| ------------- | ------------------ | ----------- | ------------------------------------- |
| `contentType` | `"text" \| "html"` | Required    | Normalized from provider payload      |
| `content`     | `string`           | Required    | Body content as returned or submitted |

### MailMessageSummary

Lightweight representation for mailbox listing results.

| Field         | Type                  | Constraints | Notes                                            |
| ------------- | --------------------- | ----------- | ------------------------------------------------ |
| `id`          | `string`              | Required    | Provider message identifier                      |
| `subject`     | `string`              | Required    | Empty string allowed when provider omits subject |
| `from`        | `MailAddress \| null` | Optional    | Sender if present                                |
| `receivedAt`  | `string \| null`      | Optional    | ISO timestamp when available                     |
| `isRead`      | `boolean`             | Required    | Normalized unread/read state                     |
| `bodyPreview` | `string \| null`      | Optional    | Provider preview snippet                         |

### MailMessage

Detailed representation for single-message retrieval.

| Field          | Type                  | Constraints | Notes                              |
| -------------- | --------------------- | ----------- | ---------------------------------- |
| `id`           | `string`              | Required    | Provider message identifier        |
| `subject`      | `string`              | Required    |                                    |
| `from`         | `MailAddress \| null` | Optional    |                                    |
| `toRecipients` | `MailAddress[]`       | Required    | May be empty                       |
| `ccRecipients` | `MailAddress[]`       | Required    | May be empty                       |
| `replyTo`      | `MailAddress[]`       | Required    | May be empty                       |
| `receivedAt`   | `string \| null`      | Optional    | ISO timestamp                      |
| `isRead`       | `boolean`             | Required    |                                    |
| `bodyPreview`  | `string \| null`      | Optional    |                                    |
| `body`         | `MailBody \| null`    | Optional    | Full body when provider returns it |

### SendMailInput

Normalized outbound message payload.

| Field             | Type                   | Constraints | Notes                              |
| ----------------- | ---------------------- | ----------- | ---------------------------------- |
| `mailbox`         | `string \| undefined`  | Optional    | Defaults to `MAIL_DEFAULT_MAILBOX` |
| `subject`         | `string`               | Required    |                                    |
| `body`            | `MailBody`             | Required    |                                    |
| `toRecipients`    | `MailAddress[]`        | Required    | At least one recipient             |
| `ccRecipients`    | `MailAddress[]`        | Optional    |                                    |
| `bccRecipients`   | `MailAddress[]`        | Optional    |                                    |
| `replyTo`         | `MailAddress[]`        | Optional    |                                    |
| `saveToSentItems` | `boolean \| undefined` | Optional    | Provider-specific send option      |

## Phase 2+ Persistent Entities

The broader feature spec still requires durable notification workflows. These entities are planned for later slices and are not yet implemented.

### NotificationEvent

Application event that can fan out into one or more notifications.

| Field               | Type     | Notes                                                                                       |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `id`                | String   | Primary key                                                                                 |
| `eventType`         | Enum     | Examples: `USER_CREATED`, `ROLE_CHANGED`, `USER_STATUS_CHANGED`, `SCOPE_ASSIGNMENT_CHANGED` |
| `triggeredByUserId` | String?  | Acting user                                                                                 |
| `affectedUserId`    | String?  | User directly impacted                                                                      |
| `scopeId`           | String?  | Optional scope reference                                                                    |
| `payload`           | Json     | Event-specific data used for templates and audit                                            |
| `createdAt`         | DateTime |                                                                                             |

### Notification

Durable outbound email record.

| Field               | Type      | Notes                                                        |
| ------------------- | --------- | ------------------------------------------------------------ |
| `id`                | String    | Primary key                                                  |
| `eventId`           | String    | FK to `NotificationEvent`                                    |
| `recipientEmail`    | String    |                                                              |
| `recipientUserId`   | String?   | If the recipient maps to a user                              |
| `locale`            | String    | Render locale                                                |
| `subject`           | String    | Rendered subject                                             |
| `bodyHtml`          | String    | Rendered body                                                |
| `status`            | Enum      | `QUEUED`, `SENDING`, `SENT`, `RETRYING`, `FAILED`, `BOUNCED` |
| `retryCount`        | Int       |                                                              |
| `providerMessageId` | String?   | Mail-provider correlation when available                     |
| `lastError`         | String?   |                                                              |
| `sentAt`            | DateTime? |                                                              |
| `createdAt`         | DateTime  |                                                              |

### NotificationTypeConfiguration

Admin-configured control for notification behavior.

| Field             | Type        | Notes                                                              |
| ----------------- | ----------- | ------------------------------------------------------------------ |
| `eventType`       | Enum        | Unique key                                                         |
| `enabled`         | Boolean     | Default true for core events                                       |
| `recipientRule`   | Json / Enum | Affected user, acting admin, role-based audiences, or combinations |
| `updatedByUserId` | String?     |                                                                    |
| `updatedAt`       | DateTime    |                                                                    |

### InboundEmail

Stored mailbox message for later processing and correlation.

| Field               | Type     | Notes                                        |
| ------------------- | -------- | -------------------------------------------- |
| `id`                | String   | Primary key                                  |
| `providerMessageId` | String   | Unique provider reference                    |
| `mailbox`           | String   | Shared mailbox address                       |
| `senderEmail`       | String?  |                                              |
| `subject`           | String   |                                              |
| `bodyPreview`       | String?  |                                              |
| `receivedAt`        | DateTime |                                              |
| `processingStatus`  | Enum     | `RECEIVED`, `PROCESSED`, `IGNORED`, `FAILED` |
| `linkedEntityType`  | String?  | Optional downstream correlation              |
| `linkedEntityId`    | String?  | Optional downstream correlation              |
| `createdAt`         | DateTime |                                              |

## Environment Configuration

| Variable               | Required      | Description                                                      |
| ---------------------- | ------------- | ---------------------------------------------------------------- |
| `MAIL_PROVIDER`        | No            | Provider selector; currently defaults to `graph`                 |
| `MAIL_DEFAULT_MAILBOX` | Recommended   | Shared mailbox used when callers do not pass an explicit mailbox |
| `GRAPH_TENANT_ID`      | Yes for Graph | Azure tenant used for token acquisition                          |
| `GRAPH_CLIENT_ID`      | Yes for Graph | App registration client ID                                       |
| `GRAPH_CLIENT_SECRET`  | Yes for Graph | App registration client secret                                   |
