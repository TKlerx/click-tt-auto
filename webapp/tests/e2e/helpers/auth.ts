import { expect, type Page } from "@playwright/test";

export const appBasePath = process.env.E2E_BASE_PATH ?? "";
export const appOrigin = `http://localhost:${process.env.E2E_PORT ?? "3280"}`;
export const mockSsoHeaders = {
  "x-e2e-mock-sso-secret":
    process.env.E2E_MOCK_SSO_SECRET ?? "e2e-mock-sso-secret",
};

export async function loginWithPassword(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto(`${appBasePath}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function expectOnDashboard(page: Page) {
  await expect(page).toHaveURL(new RegExp(`${appBasePath}/dashboard$`), {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: /welcome back/i }),
  ).toBeVisible({ timeout: 15000 });
}

export async function openUserMenu(page: Page) {
  await page.getByRole("button", { name: "Open user menu" }).click();
}

export async function loginWithSso(
  page: Page,
  args: { email: string; name: string },
) {
  await page.setExtraHTTPHeaders(mockSsoHeaders);
  const url = `${appBasePath}/api/auth/sso/azure?email=${encodeURIComponent(args.email)}&name=${encodeURIComponent(args.name)}`;
  await page.goto(url, { waitUntil: "networkidle" });
}
