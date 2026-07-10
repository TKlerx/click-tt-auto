import { expect, test } from "@playwright/test";
import {
  NotificationEventType,
  NotificationStatus,
  Role,
} from "../../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "../helpers/auth";
import {
  seedLocalUser,
  seedNotificationFixture,
  seedNotificationTypeConfiguration,
} from "../helpers/db";

test("platform admin can manage notification settings and filter the notification log", async ({
  page,
}) => {
  await seedLocalUser({
    email: "e2e-notifications-admin@example.com",
    name: "E2E Notifications Admin",
    role: Role.PLATFORM_ADMIN,
    password: "AdminPass123",
    mustChangePassword: false,
  });

  await seedLocalUser({
    email: "e2e-notifications-user@example.com",
    name: "E2E Notifications User",
    role: Role.SCOPE_USER,
    password: "UserPass123",
    mustChangePassword: false,
  });

  await seedNotificationTypeConfiguration({
    eventType: NotificationEventType.ROLE_CHANGED,
    enabled: true,
    updatedByEmail: "e2e-notifications-admin@example.com",
  });

  await seedNotificationFixture({
    eventType: NotificationEventType.ROLE_CHANGED,
    actorEmail: "e2e-notifications-admin@example.com",
    affectedUserEmail: "e2e-notifications-user@example.com",
    recipientEmail: "e2e-notifications-user@example.com",
    recipientUserEmail: "e2e-notifications-user@example.com",
    locale: "en",
    subject: "Role changed for your account",
    status: NotificationStatus.SENT,
    sentAt: "2026-04-20T09:00:00.000Z",
  });

  await seedNotificationFixture({
    eventType: NotificationEventType.USER_STATUS_CHANGED,
    actorEmail: "e2e-notifications-admin@example.com",
    affectedUserEmail: "e2e-notifications-user@example.com",
    recipientEmail: "ops@example.com",
    locale: "en",
    subject: "User status update pending retry",
    status: NotificationStatus.RETRYING,
    retryCount: 2,
    lastError: "Mailbox busy",
  });

  await loginWithPassword(
    page,
    "e2e-notifications-admin@example.com",
    "AdminPass123",
  );
  await expectOnDashboard(page);

  await page.goto(`${appBasePath}/admin/notifications`);

  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Manage notification event switches and inspect recent outbound delivery attempts.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Role changed for your account")).toBeVisible();
  await expect(
    page.getByText("User status update pending retry"),
  ).toBeVisible();
  await expect(page.getByText("Mailbox busy")).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "Queued" }).first(),
  ).toContainText("1");
  await expect(
    page.locator("article").filter({ hasText: "Sent" }).first(),
  ).toContainText("1");
  await expect(
    page.locator("article").filter({ hasText: "Failed" }).first(),
  ).toContainText("0");

  const roleChangedCard = page
    .locator("article")
    .filter({ hasText: "Role changed" })
    .first();
  const roleChangedToggle = roleChangedCard.getByRole("checkbox");
  await expect(roleChangedToggle).toBeChecked();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/notifications/settings/ROLE_CHANGED") &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
    ),
    roleChangedToggle.click(),
  ]);

  await expect(roleChangedToggle).not.toBeChecked();
  await expect(page.getByText("Notification type disabled")).toBeVisible();

  const notificationLogSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Notification log" }),
  });

  await notificationLogSection.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Role changed" }).click();
  await expect(page.getByText("Role changed for your account")).toBeVisible();
  await expect(page.getByText("User status update pending retry")).toHaveCount(
    0,
  );

  await notificationLogSection.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Sent" }).click();
  await expect(page.getByText("Role changed for your account")).toBeVisible();
  await expect(page.getByText("Mailbox busy")).toHaveCount(0);

  await notificationLogSection.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "All events" }).click();
  await notificationLogSection.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Retrying" }).click();
  await expect(
    page.getByText("User status update pending retry"),
  ).toBeVisible();
  await expect(page.getByText("Role changed for your account")).toHaveCount(0);
});
