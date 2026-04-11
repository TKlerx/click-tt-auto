import type { Locator, Page } from "playwright";

async function firstVisible(locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    if ((await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false))) {
      return locator.first();
    }
  }

  return null;
}

function normalizePageText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function assertAdminShellPage(page: Page): Promise<void> {
  const pageText = normalizePageText(await page.locator("body").textContent());
  const hasLogoutLink = (await page.getByRole("link", { name: /abmelden/i }).count()) > 0;
  const hasChampionshipTabs =
    /spielbetrieb/i.test(pageText) && /kontrolle|organisation|konfiguration/i.test(pageText);

  if (!hasLogoutLink || !hasChampionshipTabs) {
    throw new Error("Expected admin shell page after login, but required navigation elements were missing.");
  }
}

export async function login(page: Page, baseUrl: string, username: string, password: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const usernameField = await firstVisible([
    page.getByLabel(/benutzer|email|login|username/i),
    page.locator('input[name*="user" i], input[name*="email" i], input[type="email"], input[type="text"]').first()
  ]);
  const passwordField = await firstVisible([
    page.getByLabel(/passwort|password/i),
    page.locator('input[type="password"], input[name*="pass" i]').first()
  ]);

  if (!usernameField || !passwordField) {
    throw new Error("Login form could not be identified.");
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const submitButton = await firstVisible([
    page.getByRole("button", { name: /anmelden|login|einloggen/i }),
    page.locator('input[type="submit"], button[type="submit"]').first()
  ]);

  if (!submitButton) {
    throw new Error("Login submit button not found.");
  }

  await Promise.all([page.waitForLoadState("domcontentloaded"), submitButton.click()]);
  await ensureSessionActive(page);
  await assertAdminShellPage(page);
}

export async function ensureSessionActive(page: Page): Promise<void> {
  const loginFormVisible = await page
    .locator('input[type="password"], input[name*="pass" i]')
    .first()
    .isVisible()
    .catch(() => false);

  if (loginFormVisible) {
    throw new Error("Session expired or login failed.");
  }
}
