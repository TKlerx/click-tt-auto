import { expect, test } from "@playwright/test";
import { AuthMethod, Role, UserStatus } from "../../../generated/prisma/enums";
import { appBasePath, appOrigin, mockSsoHeaders } from "../helpers/auth";
import { seedSsoUser } from "../helpers/db";

test("mock Azure SSO can complete the CLI browser login flow", async ({
  page,
}) => {
  await seedSsoUser({
    email: "e2e-cli-sso@example.com",
    name: "E2E CLI SSO",
    role: Role.SCOPE_USER,
    status: UserStatus.ACTIVE,
    authMethod: AuthMethod.SSO,
  });

  await page.goto(
    `${appBasePath}/api/cli-auth/authorize?callback_url=${encodeURIComponent(`${appOrigin}/cli-callback`)}&state=cli-sso-state`,
  );

  await expect(page).toHaveURL(/\/login\?/);
  const currentUrl = new URL(page.url());
  const redirectTo = currentUrl.searchParams.get("redirectTo");
  expect(redirectTo).toBeTruthy();

  await page.setExtraHTTPHeaders(mockSsoHeaders);
  await page.goto(
    `${appBasePath}/api/auth/sso/azure?email=${encodeURIComponent("e2e-cli-sso@example.com")}&name=${encodeURIComponent("E2E CLI SSO")}&redirectTo=${encodeURIComponent(redirectTo!)}`,
    { waitUntil: "networkidle" },
  );

  await expect(
    page.getByRole("heading", { name: "Approve CLI login" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve login" }).click();

  await expect(page).toHaveURL(/\/cli-callback\?code=.*state=cli-sso-state/, {
    timeout: 30000,
  });
});
