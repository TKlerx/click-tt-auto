import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "./helpers/auth";
import { assignUserToScope, seedLocalUser } from "./helpers/db";

const scopeCode = "OWL";
const season = "2026/27";
const scope = { code: scopeCode, name: "Ostwestfalen-Lippe" };

test("imports a source in the selected planning workspace", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-raster-import-ux-${suffix}@example.com`;
  const password = "RasterImport123";
  await page.setViewportSize({ width: 390, height: 844 });

  await seedLocalUser({
    email,
    name: "E2E Raster Importer",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const inputSetResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: { scope: scopeCode, season, name: `E2E import UX ${suffix}` },
    },
  );
  expect(inputSetResponse.status()).toBe(201);
  const { inputSet } = (await inputSetResponse.json()) as {
    inputSet: { id: string; name: string };
  };

  await page.goto(
    `${appBasePath}/raster/import?scope=${scopeCode}&season=${encodeURIComponent(season)}&workspace=${inputSet.id}`,
  );

  await expect(
    page.getByRole("heading", { name: `${scopeCode} · ${season}` }),
  ).toBeVisible();
  await expect(
    page.getByText(`Active workspace: ${inputSet.name}`),
  ).toBeVisible();
  await expect(page.getByLabel("click-TT group URL")).toBeVisible();

  await page
    .getByLabel("click-TT group URL")
    .fill("http://127.0.0.1:9/missing.pdf");
  await page.getByLabel("Display name").first().fill(`E2E groups ${suffix}`);
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(page.getByText(`E2E groups ${suffix}`)).toBeVisible();
  await expect(page.getByText("Needs parse").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /parse/i }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /parse/i }).first().click();
  await expect(
    page.getByText(/Source refresh failed|fetch failed/i),
  ).toBeVisible();
  await expect(page.getByText(`E2E groups ${suffix}`)).toBeVisible();
});
