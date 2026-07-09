import { expect, test } from "@playwright/test";
import { Role } from "../../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "../helpers/auth";
import { seedLocalUser } from "../helpers/db";

test("creating a user produces queued notification records in the admin log", async ({
  page,
}) => {
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const createdUser = {
    email: `e2e-notify-${uniqueSuffix}@example.com`,
    name: `E2E Notify ${uniqueSuffix}`,
    temporaryPassword: "TempPass123",
  };

  await seedLocalUser({
    email: "e2e-event-admin@example.com",
    name: "E2E Event Admin",
    role: Role.PLATFORM_ADMIN,
    password: "AdminPass123",
    mustChangePassword: false,
  });

  await loginWithPassword(page, "e2e-event-admin@example.com", "AdminPass123");
  await expectOnDashboard(page);

  await page.goto(`${appBasePath}/users`);
  await page.getByRole("button", { name: "Create user" }).first().click();

  const createUserDialog = page.getByRole("dialog");
  await expect(createUserDialog).toBeVisible();
  await createUserDialog.getByPlaceholder("Email").fill(createdUser.email);
  await createUserDialog.getByPlaceholder("Name").fill(createdUser.name);
  await createUserDialog.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Scoped User" }).click();
  await createUserDialog
    .getByPlaceholder("Temporary password")
    .fill(createdUser.temporaryPassword);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/users") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    ),
    createUserDialog.getByRole("button", { name: "Create user" }).click(),
  ]);

  await page.goto(`${appBasePath}/admin/notifications`);
  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(page.getByText("Your account is ready")).toBeVisible();
  await expect(
    page.getByText(`New user created: ${createdUser.name}`).first(),
  ).toBeVisible();
  const createdUserRow = page
    .locator("tr", { hasText: createdUser.email })
    .first();
  await expect(createdUserRow).toBeVisible();
  await expect(createdUserRow).toContainText("Queued");
});
