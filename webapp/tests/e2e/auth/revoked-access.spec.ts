import { expect, test } from "@playwright/test";
import { AuthMethod, Role, UserStatus } from "../../../generated/prisma/enums";
import { appBasePath, expectOnDashboard, loginWithSso } from "../helpers/auth";
import { seedSsoUser, updateUserStatus } from "../helpers/db";

test("inactive SSO user is redirected to login with a revoked-access message on next protected request", async ({
  page,
}) => {
  const email = `e2e-revoked-${Date.now().toString(36)}@example.com`;

  await seedSsoUser({
    email,
    name: "E2E Revoked SSO",
    role: Role.SCOPE_USER,
    status: UserStatus.ACTIVE,
    authMethod: AuthMethod.SSO,
  });

  await loginWithSso(page, {
    email,
    name: "E2E Revoked SSO",
  });
  await expectOnDashboard(page);

  await updateUserStatus(email, UserStatus.INACTIVE);

  await page.goto(`${appBasePath}/campaigns`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(
    new RegExp(`${appBasePath}/login\\?error=revoked$`),
    {
      timeout: 15000,
    },
  );
  await expect(
    page.getByText(
      "Your SSO access has been revoked. Please contact an administrator.",
    ),
  ).toBeVisible();
});
