import { test, expect } from "@playwright/test";
import { Role } from "../../../generated/prisma/enums";
import {
  loginWithPassword,
  appBasePath,
  expectOnDashboard,
} from "../helpers/auth";
import { seedLocalUser } from "../helpers/db";

test("local user is forced to change password on first login", async ({
  page,
}) => {
  await seedLocalUser({
    email: "e2e-temp-user@example.com",
    name: "E2E Temp User",
    role: Role.SCOPE_USER,
    password: "TempPass123",
    mustChangePassword: true,
  });

  await loginWithPassword(page, "e2e-temp-user@example.com", "TempPass123");

  await expect(page).toHaveURL(new RegExp(`${appBasePath}/change-password$`));
  await page.getByLabel("Current password").fill("TempPass123");
  await page.getByLabel("New password").fill("FreshPass123");
  await page.getByRole("button", { name: "Save new password" }).click();

  await expectOnDashboard(page);
});
