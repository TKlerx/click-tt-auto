import { describe, expect, it, vi } from "vitest";
import { createGraphMailClient } from "@/lib/mail";

function createFetchMock(responses: Response[]) {
  return vi.fn().mockImplementation(async () => {
    const next = responses.shift();
    if (!next) {
      throw new Error("Unexpected fetch call");
    }
    return next;
  });
}

describe("graph mail client", () => {
  it("lists messages from the configured mailbox and reuses the token", async () => {
    const fetchMock = createFetchMock([
      Response.json({ access_token: "graph-token", expires_in: 3600 }),
      Response.json({
        value: [
          {
            id: "msg-1",
            subject: "Quarterly update",
            from: {
              emailAddress: {
                address: "sender@example.com",
                name: "Sender",
              },
            },
            receivedDateTime: "2026-04-19T08:30:00.000Z",
            isRead: false,
            hasAttachments: true,
            bodyPreview: "Preview text",
            conversationId: "conv-1",
          },
        ],
      }),
      Response.json({
        id: "msg-1",
        subject: "Quarterly update",
        from: {
          emailAddress: {
            address: "sender@example.com",
            name: "Sender",
          },
        },
        receivedDateTime: "2026-04-19T08:30:00.000Z",
        isRead: false,
        hasAttachments: true,
        bodyPreview: "Preview text",
        conversationId: "conv-1",
        internetMessageId: "<message-id>",
        toRecipients: [
          {
            emailAddress: {
              address: "shared@example.com",
              name: "Shared Mailbox",
            },
          },
        ],
        body: {
          contentType: "HTML",
          content: "<p>Hello</p>",
        },
      }),
    ]);

    const client = createGraphMailClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      tenantId: "tenant-id",
      defaultMailbox: "shared@example.com",
      fetchImpl: fetchMock as typeof fetch,
    });

    const summaries = await client.listMessages({ unreadOnly: true, top: 10 });
    const message = await client.getMessage({ messageId: "msg-1" });

    expect(summaries).toEqual([
      {
        id: "msg-1",
        subject: "Quarterly update",
        from: {
          email: "sender@example.com",
          name: "Sender",
        },
        receivedAt: "2026-04-19T08:30:00.000Z",
        isRead: false,
        hasAttachments: true,
        bodyPreview: "Preview text",
        conversationId: "conv-1",
      },
    ]);

    expect(message).toMatchObject({
      id: "msg-1",
      subject: "Quarterly update",
      body: {
        contentType: "html",
        content: "<p>Hello</p>",
      },
      toRecipients: [
        {
          email: "shared@example.com",
          name: "Shared Mailbox",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "/users/shared%40example.com/mailFolders/inbox/messages?",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer graph-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/users/shared%40example.com/messages/msg-1?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer graph-token",
        }),
      }),
    );
  });

  it("sends a message via the selected mailbox", async () => {
    const fetchMock = createFetchMock([
      Response.json({ access_token: "graph-token", expires_in: 3600 }),
      new Response(null, { status: 202 }),
    ]);

    const client = createGraphMailClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      tenantId: "tenant-id",
      fetchImpl: fetchMock as typeof fetch,
    });

    await client.sendMessage({
      mailbox: "shared@example.com",
      subject: "Hello",
      body: {
        contentType: "html",
        content: "<p>Hi there</p>",
      },
      toRecipients: [{ email: "user@example.com", name: "User" }],
      ccRecipients: [{ email: "copy@example.com" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://graph.microsoft.com/v1.0/users/shared%40example.com/sendMail",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: {
            subject: "Hello",
            body: {
              contentType: "HTML",
              content: "<p>Hi there</p>",
            },
            toRecipients: [
              {
                emailAddress: {
                  address: "user@example.com",
                  name: "User",
                },
              },
            ],
            ccRecipients: [
              {
                emailAddress: {
                  address: "copy@example.com",
                },
              },
            ],
            bccRecipients: [],
            replyTo: [],
          },
          saveToSentItems: true,
        }),
      }),
    );
  });

  it("throws a useful error when Graph rejects the request", async () => {
    const fetchMock = createFetchMock([
      Response.json({ access_token: "graph-token", expires_in: 3600 }),
      new Response("forbidden", { status: 403 }),
    ]);

    const client = createGraphMailClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      tenantId: "tenant-id",
      defaultMailbox: "shared@example.com",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.listMessages()).rejects.toThrow(
      "Graph mail request failed: 403 forbidden",
    );
  });

  it("requires either a default mailbox or an explicit mailbox per request", async () => {
    const client = createGraphMailClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      tenantId: "tenant-id",
      fetchImpl: vi.fn() as typeof fetch,
    });

    await expect(client.listMessages()).rejects.toThrow(
      "A mailbox address is required. Set MAIL_DEFAULT_MAILBOX or pass mailbox explicitly.",
    );
  });
});
