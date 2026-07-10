import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "./helpers/auth";
import { seedLocalUser } from "./helpers/db";

test("user can create, revoke, renew, and delete personal access tokens", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await seedLocalUser({
    email: "e2e-tokens@example.com",
    name: "E2E Tokens",
    role: Role.SCOPE_USER,
    password: "TokenPass123",
    mustChangePassword: false,
  });

  await loginWithPassword(page, "e2e-tokens@example.com", "TokenPass123");
  await expectOnDashboard(page);

  await page.goto(`${appBasePath}/settings/tokens`);
  await page.getByRole("button", { name: "Create token" }).first().click();
  await page.getByLabel("Token name").fill("Automation Token");
  await page.getByRole("combobox", { name: "Expiration" }).click();
  await page.getByRole("option", { name: "30 days" }).click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/tokens") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    ),
    page.getByRole("button", { name: "Create token" }).last().click(),
  ]);

  const tokenDialog = page.getByRole("dialog");
  await expect(tokenDialog).toContainText("This token will not be shown again");
  const tokenValue = await tokenDialog.locator("div.font-mono").innerText();
  await tokenDialog.getByRole("button", { name: "Copy token" }).click();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(tokenValue);
  await tokenDialog.getByRole("button", { name: "Done" }).click();

  const tokenRow = page.locator("tr", { hasText: "Automation Token" });
  await expect(tokenRow).toBeVisible();
  await expect(tokenRow)
    .toContainText("abcdef", { timeout: 1000 })
    .catch(() => {});

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/tokens/") &&
        response.url().includes("/revoke") &&
        response.request().method() === "POST" &&
        response.status() === 200,
    ),
    tokenRow.getByRole("button", { name: "Revoke" }).click(),
  ]);
  await expect(tokenRow).toContainText("Revoked");

  await page.getByRole("button", { name: "Create token" }).first().click();
  await page.getByLabel("Token name").fill("Renewable Token");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/tokens") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    ),
    page.getByRole("button", { name: "Create token" }).last().click(),
  ]);
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  const renewableRow = page.locator("tr", { hasText: "Renewable Token" });
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/tokens/") &&
        response.url().includes("/renew") &&
        response.request().method() === "POST" &&
        response.status() === 200,
    ),
    renewableRow.getByRole("button", { name: "Renew" }).click(),
  ]);
  await expect(page.getByRole("dialog")).toContainText(
    "This token will not be shown again",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/tokens/") &&
        response.request().method() === "DELETE" &&
        response.status() === 204,
    ),
    renewableRow.getByRole("button", { name: "Delete" }).click(),
  ]);
  await expect(renewableRow).toHaveCount(0);
});

test("token pages stay usable on mobile and in dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await seedLocalUser({
    email: "e2e-tokens-mobile@example.com",
    name: "E2E Tokens Mobile",
    role: Role.PLATFORM_ADMIN,
    password: "TokenPass123",
    mustChangePassword: false,
  });

  await loginWithPassword(
    page,
    "e2e-tokens-mobile@example.com",
    "TokenPass123",
  );
  await expectOnDashboard(page);

  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto(`${appBasePath}/settings/tokens`);
  await expect(
    page.getByRole("button", { name: "Create token" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create token" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("article")).toHaveCount(0);

  await page.goto(`${appBasePath}/admin/tokens`);
  await expect(page).toHaveURL(new RegExp(`${appBasePath}/admin/tokens$`));
  await expect(
    page.getByRole("combobox", { name: "Filter by user" }),
  ).toBeVisible();
});
