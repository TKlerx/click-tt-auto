import { expect, test } from "@playwright/test";
import { appBasePath, loginWithSso } from "../helpers/auth";
import { findUserByEmail } from "../helpers/db";

test("first-time SSO user lands on pending approval page", async ({ page }) => {
  const email = `e2e-sso-${Date.now().toString(36)}@example.com`;

  await loginWithSso(page, {
    email,
    name: "E2E First Time SSO",
  });

  await expect(page).toHaveURL(new RegExp(`${appBasePath}/pending$`), {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", {
      name: /your account is pending administrator approval/i,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(new RegExp(`${appBasePath}/login$`));

  const user = await findUserByEmail(email);
  expect(user?.status).toBe("PENDING_APPROVAL");
  expect(user?.authMethod).toBe("SSO");
});
