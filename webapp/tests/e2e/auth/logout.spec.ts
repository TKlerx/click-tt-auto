import { test } from "@playwright/test";
import { Role } from "../../../generated/prisma/enums";
import {
  loginWithPassword,
  appBasePath,
  expectOnDashboard,
} from "../helpers/auth";
import { seedLocalUser } from "../helpers/db";

test("authenticated user can sign out and returns to login", async ({
  page,
}) => {
  await seedLocalUser({
    email: "e2e-admin@example.com",
    name: "E2E Admin",
    role: Role.PLATFORM_ADMIN,
    password: "AdminPass123",
    mustChangePassword: false,
  });

  await loginWithPassword(page, "e2e-admin@example.com", "AdminPass123");
  await expectOnDashboard(page);

  await page
    .locator("header")
    .getByRole("button", { name: "Sign out" })
    .click();
  await page.waitForURL(new RegExp(`${appBasePath}/login$`));
});
