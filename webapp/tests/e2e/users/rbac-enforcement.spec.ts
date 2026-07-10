import { test, expect } from "@playwright/test";
import { Role } from "../../../generated/prisma/enums";
import {
  loginWithPassword,
  appBasePath,
  expectOnDashboard,
} from "../helpers/auth";
import { seedLocalUser } from "../helpers/db";

test("marketer cannot access user management", async ({ page }) => {
  await seedLocalUser({
    email: "e2e-marketer@example.com",
    name: "E2E Marketer",
    role: Role.SCOPE_USER,
    password: "MarketerPass123",
    mustChangePassword: false,
  });

  await loginWithPassword(page, "e2e-marketer@example.com", "MarketerPass123");
  await expectOnDashboard(page);
  await page.goto(`${appBasePath}/users`);

  await expect(
    page.getByText("You are not authorized to access this page."),
  ).toBeVisible();
});
