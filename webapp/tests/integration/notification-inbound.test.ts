import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { processInboundEmailRecord } from "@/services/notifications/inbound";

describe("notification inbound processing", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks bounced notifications when an inbound bounce references a notification", async () => {
    prismaMock.notification.findFirst.mockResolvedValue({
      id: "notification-1",
      providerMessageId: "<provider-message-1@example.com>",
    } as never);

    const inbound = {
      id: "inbound-1",
      subject:
        "Undeliverable: Your role has changed [notification:notification-1]",
      bodyPreview: "Delivery failed",
      bodyText:
        "Delivery failed for Notification reference: [notification:notification-1]",
      bodyHtml: null,
      inReplyTo: "<provider-message-1@example.com>",
      referenceIds: '["<provider-message-1@example.com>"]',
      senderEmail: "postmaster@example.com",
    };

    const result = await processInboundEmailRecord(inbound);

    expect(result).toMatchObject({
      processingStatus: "PROCESSED",
      correlatedNotificationId: "notification-1",
    });
    expect(prismaMock.notification.update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "BOUNCED",
        lastError: "Bounce/NDR received for inbound email inbound-1",
      },
    });
    expect(prismaMock.inboundEmail.update).toHaveBeenCalledWith({
      where: { id: "inbound-1" },
      data: expect.objectContaining({
        processingStatus: "PROCESSED",
        correlatedNotificationId: "notification-1",
      }),
    });
  });

  it("ignores bounce-like messages without provider-message correlation", async () => {
    prismaMock.notification.findFirst.mockResolvedValue(null);

    const inbound = {
      id: "inbound-3",
      subject:
        "Undeliverable: Your role has changed [notification:notification-1]",
      bodyPreview: "Delivery failed",
      bodyText:
        "Delivery failed for Notification reference: [notification:notification-1]",
      bodyHtml: null,
      inReplyTo: "<different-message@example.com>",
      referenceIds: '["<different-message@example.com>"]',
      senderEmail: "postmaster@example.com",
    };

    const result = await processInboundEmailRecord(inbound);

    expect(result).toMatchObject({
      processingStatus: "IGNORED",
      correlatedNotificationId: null,
    });
    expect(prismaMock.notification.update).not.toHaveBeenCalled();
  });

  it("ignores bounce-like messages when body content disagrees with provider correlation", async () => {
    prismaMock.notification.findFirst.mockResolvedValue({
      id: "notification-from-provider",
      providerMessageId: "<provider-message-2@example.com>",
    } as never);

    const inbound = {
      id: "inbound-4",
      subject:
        "Undeliverable: Your role has changed [notification:notification-from-body]",
      bodyPreview: "Delivery failed",
      bodyText:
        "Delivery failed for Notification reference: [notification:notification-from-body]",
      bodyHtml: null,
      inReplyTo: "<provider-message-2@example.com>",
      referenceIds: '["<provider-message-2@example.com>"]',
      senderEmail: "postmaster@example.com",
    };

    const result = await processInboundEmailRecord(inbound);

    expect(result).toMatchObject({
      processingStatus: "IGNORED",
      correlatedNotificationId: null,
    });
    expect(prismaMock.notification.update).not.toHaveBeenCalled();
    expect(prismaMock.inboundEmail.update).toHaveBeenCalledWith({
      where: { id: "inbound-4" },
      data: expect.objectContaining({
        processingStatus: "IGNORED",
        processingNotes:
          "Bounce-like message content disagreed with provider-message correlation.",
      }),
    });
  });

  it("links entity references when no bounce correlation is present", async () => {
    const inbound = {
      id: "inbound-2",
      subject: "Question about [ref:Scope:scope-7]",
      bodyPreview: "",
      bodyText: "Following up on [ref:Scope:scope-7]",
      bodyHtml: null,
      inReplyTo: null,
      referenceIds: "[]",
      senderEmail: "person@example.com",
    };

    const result = await processInboundEmailRecord(inbound);

    expect(result).toMatchObject({
      processingStatus: "PROCESSED",
      linkedEntityType: "Scope",
      linkedEntityId: "scope-7",
    });
    expect(prismaMock.inboundEmail.update).toHaveBeenCalledWith({
      where: { id: "inbound-2" },
      data: {
        processingStatus: "PROCESSED",
        processingNotes: "Entity reference marker detected.",
        linkedEntityType: "Scope",
        linkedEntityId: "scope-7",
      },
    });
  });
});
