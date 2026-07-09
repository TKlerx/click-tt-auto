import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "./helpers/auth";
import { seedLocalUser } from "./helpers/db";

test("authenticated users can open the API docs page and see Swagger content", async ({
  page,
}) => {
  await seedLocalUser({
    email: "e2e-docs@example.com",
    name: "E2E Docs",
    role: Role.SCOPE_USER,
    password: "DocsPass123",
    mustChangePassword: false,
  });

  await loginWithPassword(page, "e2e-docs@example.com", "DocsPass123");
  await expectOnDashboard(page);

  await page.goto(`${appBasePath}/docs/api`);
  await expect(
    page.getByRole("heading", { name: "API reference" }),
  ).toBeVisible();
  await expect(page.locator("#swagger-ui")).toBeVisible();
  await expect(page.locator("#swagger-ui")).toContainText("/api/tokens", {
    timeout: 30000,
  });
  await expect(page.locator("#swagger-ui")).toContainText(
    "/api/cli-auth/authorize",
    { timeout: 30000 },
  );
});
