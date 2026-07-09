import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import { expectOnDashboard, loginWithPassword } from "./helpers/auth";
import { seedLocalUser } from "./helpers/db";

test("locale switcher reloads the app with the selected language", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "starter_app_locale",
      value: "en",
      domain: "localhost",
      path: "/",
    },
  ]);

  await seedLocalUser({
    email: "e2e-locale-user@example.com",
    name: "E2E Locale User",
    role: Role.SCOPE_USER,
    password: "LocalePass123",
    mustChangePassword: false,
  });

  await loginWithPassword(page, "e2e-locale-user@example.com", "LocalePass123");
  await expectOnDashboard(page);

  await page.getByRole("combobox", { name: "Locale" }).click();
  await page.getByRole("option", { name: "Deutsch" }).click();

  await expect(
    page.getByRole("heading", { name: /Willkommen zuruck/i }),
  ).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("combobox", { name: "Locale" })).toContainText(
    "Deutsch",
  );
});
