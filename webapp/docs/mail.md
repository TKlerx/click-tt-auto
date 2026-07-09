# Mail Integration

The starter now includes a provider-neutral mail abstraction in [`src/lib/mail`](../src/lib/mail/).

## Current Provider Support

- `graph`

The first implementation uses Microsoft Graph application credentials only. It is designed for shared mailbox and service-mailbox scenarios where the app reads messages and sends mail without interactive user consent during each request.

## Current Capabilities

- list messages from a mailbox folder
- fetch a single message by ID
- send a message from a mailbox
- queue and deliver outbound notification emails for supported user-management events

Not implemented yet:

- webhook subscriptions
- inbound sync jobs or worker-driven mailbox polling
- attachments
- draft handling
- delete / move / mark-as-read mutations
- non-Graph providers

## Environment Variables

Required:

- `MAIL_PROVIDER=graph`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`
- `GRAPH_TENANT_ID`

Optional:

- `MAIL_DEFAULT_MAILBOX`

## Usage

```ts
import { createMailClient } from "@/lib/mail";

const mail = createMailClient();

const inbox = await mail.listMessages({
  folder: "inbox",
  unreadOnly: true,
  top: 10,
});

const message = await mail.getMessage({
  messageId: inbox[0]!.id,
});

await mail.sendMessage({
  subject: `Re: ${message.subject}`,
  body: {
    contentType: "html",
    content: "<p>Thanks, we received your message.</p>",
  },
  toRecipients: [{ email: "user@example.com" }],
});
```

If `MAIL_DEFAULT_MAILBOX` is not set, pass `mailbox` explicitly on each operation.

## Outbound Notifications

The current `014` slice now persists notification events and outbound notifications,
then queues delivery through the shared `BackgroundJob` table using the
`notification_delivery` job type.

Currently wired events:

- local user creation
- role changes
- user status changes

Delivery is asynchronous through the Python worker. The worker uses the same shared
Graph application credentials and shared mailbox configuration as the Next.js app.

## Admin Visibility

Platform administrators now have a notification management surface under
`/admin/notifications` backed by:

- `GET /api/notifications` for recent delivery log entries
- `GET /api/notifications/settings` for the current event-type switches
- `PATCH /api/notifications/settings/[eventType]` to enable or disable supported event types

The first configurable event types are:

- `USER_CREATED`
- `ROLE_CHANGED`
- `USER_STATUS_CHANGED`

## Microsoft Graph Permissions

For shared mailbox usage, the Entra application typically needs Graph application permissions such as:

- `Mail.Read` or `Mail.ReadBasic.All`
- `Mail.Send`

In production, scope access as tightly as possible. If the app should only reach one or a few mailboxes, use Exchange application access policies or the newer mailbox-scoping controls available in your tenant.

## Design Notes

- The abstraction boundary is the `MailClient` interface in [`src/lib/mail/types.ts`](../src/lib/mail/types.ts).
- Provider selection currently happens in [`src/lib/mail/provider.ts`](../src/lib/mail/provider.ts).
- The Graph implementation caches app tokens in memory for the client instance and requests `https://graph.microsoft.com/.default`.
