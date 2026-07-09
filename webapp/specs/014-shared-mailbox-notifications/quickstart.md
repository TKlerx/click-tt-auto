# Quickstart: Shared Mailbox Notifications

**Date**: 2026-04-19

## Current Scope

The implemented first slice provides a reusable mail abstraction with a Microsoft Graph provider. It can:

- list messages from a shared mailbox
- fetch a message by ID
- send a message from the shared mailbox

Notification workflows, inbox polling, admin settings, and durable delivery tracking are planned follow-up slices.

## Prerequisites

- Node.js and pnpm installed
- Project dependencies installed with `pnpm install`
- Microsoft 365 / Azure app registration configured for Graph mail access
- Environment variables set for:
  - `GRAPH_TENANT_ID`
  - `GRAPH_CLIENT_ID`
  - `GRAPH_CLIENT_SECRET`
  - `MAIL_PROVIDER=graph`
  - `MAIL_DEFAULT_MAILBOX=<shared-mailbox@example.com>` (recommended)

## Example Usage

Create a mail client inside server-side code:

```ts
import { createMailClient } from "@/lib/mail";

const mail = createMailClient();

const inbox = await mail.listMessages({
  top: 10,
  unreadOnly: true,
});

const message = await mail.getMessage({
  messageId: inbox.messages[0]?.id ?? "",
});

await mail.sendMessage({
  subject: "Shared mailbox smoke test",
  body: {
    contentType: "text",
    content: "Hello from the shared mailbox abstraction.",
  },
  toRecipients: [{ address: "user@example.com" }],
});
```

## Key Files

- `src/lib/mail/types.ts` - provider-neutral interface and payload types
- `src/lib/mail/provider.ts` - provider selection and configuration checks
- `src/lib/mail/graph.ts` - Microsoft Graph transport and mapping
- `docs/mail.md` - operator/developer documentation
- `tests/unit/mail-provider.test.ts` and `tests/unit/graph-mail.test.ts` - focused validation

## Validation Commands

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run tests/unit/mail-provider.test.ts tests/unit/graph-mail.test.ts
.\validate.ps1 all
```

## Next Delivery Steps

1. Add durable notification models and a delivery service.
2. Wire one or two high-value events first, such as role changes and user creation.
3. Add admin visibility only after delivery state exists.
4. Add worker-based inbound mailbox polling and bounce processing.
