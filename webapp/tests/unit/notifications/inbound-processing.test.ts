import { describe, expect, it } from "vitest";
import {
  appendNotificationReferenceHtml,
  appendNotificationReferenceText,
  detectBounceLikeMessage,
  extractEntityReference,
  extractNotificationReference,
} from "@/services/notifications/inbound";

describe("inbound notification helpers", () => {
  it("appends and extracts notification references", () => {
    const bodyText = appendNotificationReferenceText(
      "Hello there",
      "notification-123",
    );
    const bodyHtml = appendNotificationReferenceHtml(
      "<p>Hello there</p>",
      "notification-123",
    );

    expect(bodyText).toContain("[notification:notification-123]");
    expect(bodyHtml).toContain("[notification:notification-123]");
    expect(
      extractNotificationReference({
        bodyText,
        bodyHtml,
      }),
    ).toBe("notification-123");
  });

  it("extracts entity reference markers from inbound content", () => {
    expect(
      extractEntityReference({
        subject: "Re: Update [ref:User:user-42]",
      }),
    ).toEqual({
      entityType: "User",
      entityId: "user-42",
    });
  });

  it("detects bounce-like senders and subjects", () => {
    expect(
      detectBounceLikeMessage({
        senderEmail: "postmaster@example.com",
        subject: "Delivery Status Notification (Failure)",
      }),
    ).toBe(true);

    expect(
      detectBounceLikeMessage({
        senderEmail: "person@example.com",
        subject: "Regular reply",
      }),
    ).toBe(false);
  });
});
