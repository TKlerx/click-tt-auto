# Mail Service Contract: Shared Mailbox Foundation

**Date**: 2026-04-19

This contract describes the internal service boundary for the Phase 1 mail abstraction. It is not a public HTTP API contract.

## Provider Resolution

### `getConfiguredMailProvider(): "graph"`

- Reads `MAIL_PROVIDER`
- Defaults to `"graph"` when unset
- Throws if a non-supported provider value is configured

### `hasUsableMailConfig(): boolean`

- Returns `true` when the selected provider has the minimum configuration required to operate
- For Graph, this means tenant ID, client ID, and client secret are present

### `createMailClient(): MailClient`

- Creates the configured provider client
- Throws when configuration is invalid or unsupported

## `MailClient` Interface

### `listMessages(input): Promise<{ messages: MailMessageSummary[] }>`

**Input**:

```ts
{
  mailbox?: string;
  folder?: string;
  top?: number;
  unreadOnly?: boolean;
}
```

**Behavior**:

- Uses `input.mailbox` or falls back to `MAIL_DEFAULT_MAILBOX`
- Defaults the Graph folder to `Inbox`
- Returns normalized message summaries
- Throws when no mailbox can be resolved

### `getMessage(input): Promise<MailMessage>`

**Input**:

```ts
{
  mailbox?: string;
  messageId: string;
}
```

**Behavior**:

- Resolves mailbox the same way as `listMessages`
- Returns a normalized full message record
- Throws when no mailbox can be resolved or the provider call fails

### `sendMessage(input): Promise<void>`

**Input**:

```ts
{
  mailbox?: string;
  subject: string;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  toRecipients: { address: string; name?: string }[];
  ccRecipients?: { address: string; name?: string }[];
  bccRecipients?: { address: string; name?: string }[];
  replyTo?: { address: string; name?: string }[];
  saveToSentItems?: boolean;
}
```

**Behavior**:

- Resolves mailbox from input or `MAIL_DEFAULT_MAILBOX`
- Requires at least one recipient
- Sends through the provider using application credentials
- Treats Graph `202 Accepted` and `204 No Content` as success

## Graph Provider Notes

- Access token source: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- Scope: `https://graph.microsoft.com/.default`
- Access tokens are cached in-memory per process until near expiry
- Mailbox calls use `https://graph.microsoft.com/v1.0/users/{mailbox}/...`

## Error Expectations

- Unsupported provider configuration raises a synchronous configuration error
- Missing mailbox raises a clear caller-facing error
- Graph HTTP failures surface the provider response details when available
- Transient retries are not part of Phase 1; callers that need retry semantics must add them at a higher layer
