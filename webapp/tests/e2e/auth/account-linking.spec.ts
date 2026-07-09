import { expect, test } from "@playwright/test";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import {
  appOrigin,
  expectOnDashboard,
  loginWithPassword,
  loginWithSso,
} from "../helpers/auth";
import { findUserByEmail, seedLocalUser } from "../helpers/db";

test("existing local account reused when signing in with SSO for the same email", async ({
  browser,
}) => {
  const email = `e2e-linked-${Date.now().toString(36)}@example.com`;

  await seedLocalUser({
    email,
    name: "E2E Linked User",
    role: Role.SCOPE_USER,
    password: "TempPass123",
    mustChangePassword: false,
    status: UserStatus.ACTIVE,
  });

  const userBefore = await findUserByEmail(email);
  expect(userBefore).not.toBeNull();

  const localContext = await browser.newContext({ baseURL: appOrigin });
  const ssoContext = await browser.newContext({ baseURL: appOrigin });
  const localPage = await localContext.newPage();
  const ssoPage = await ssoContext.newPage();

  try {
    await loginWithPassword(localPage, email, "TempPass123");
    await expectOnDashboard(localPage);

    await loginWithSso(ssoPage, {
      email,
      name: "E2E Linked User Updated",
    });
    await expectOnDashboard(ssoPage);

    const userAfter = await findUserByEmail(email);
    expect(userAfter?.id).toBe(userBefore?.id);
    expect(userAfter?.authMethod).toBe("BOTH");
    expect(userAfter?.status).toBe("ACTIVE");
  } finally {
    await localContext.close();
    await ssoContext.close();
  }
});
