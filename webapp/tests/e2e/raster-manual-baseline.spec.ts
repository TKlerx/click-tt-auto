import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "./helpers/auth";
import {
  assignUserToScope,
  countRasterManualBaselines,
  seedLocalUser,
  seedRasterManualBaselineFixture,
  seedRasterScopeHierarchy,
} from "./helpers/db";

const scope = { code: "OWL", name: "Ostwestfalen/Lippe" };
const query = "scope=OWL&season=2026%2F27";

test("scheduler imports, reviews, and compares a manual baseline", async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const email = `e2e-raster-baseline-${suffix}@example.com`;
  const password = "RasterBaseline123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Baseline",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  const fixture = await seedRasterManualBaselineFixture({ email, suffix });

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  await page.route("**/api/raster/input-sets/*/baseline", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, json: { baseline: { id: "mock" } } });
    } else {
      await route.continue();
    }
  });
  await page.goto(
    `${appBasePath}/raster/review?${query}&workspace=${fixture.emptyInputSetId}`,
  );
  await page.getByText("Manual baseline (not imported)").click();
  await page.getByRole("button", { name: "Import baseline" }).click();
  await expect(page.getByText("Manual baseline imported.")).toBeVisible();
  await page.unroute("**/api/raster/input-sets/*/baseline");

  await page.route("**/api/raster/input-sets/*/baseline", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 502,
        json: { error: "Simulated scrape failure." },
      });
    } else {
      await route.continue();
    }
  });
  await page.goto(
    `${appBasePath}/raster/review?${query}&workspace=${fixture.readyInputSetId}`,
  );
  await page.getByText("Manual baseline (READY)").click();
  await page.getByRole("button", { name: "Refresh baseline" }).click();
  await expect(page.getByText("Simulated scrape failure.")).toBeVisible();
  await expect(page.getByText("Manual baseline (READY)")).toBeVisible();
  await page.unroute("**/api/raster/input-sets/*/baseline");

  await page.goto(
    `${appBasePath}/raster/review?${query}&workspace=${fixture.reviewInputSetId}`,
  );
  await expect(page.getByText("2 rows", { exact: true })).toBeVisible();
  await expect(page.getByText("1 to review", { exact: true })).toBeVisible();
  await expect(page.getByText("Version history (2)")).toBeVisible();
  await page
    .locator('select[id^="baseline-target-"]')
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByText("Manual baseline (READY)")).toBeVisible();
  await expect(page.getByText("Renamed Club")).not.toBeVisible();

  await page.goto(
    `${appBasePath}/raster/run?${query}&workspace=${fixture.readyInputSetId}`,
  );
  await expect(
    page.getByText("Manual baseline comparison (optional)"),
  ).toBeVisible();
  await expect(
    page.locator("select").filter({ hasText: "Imported" }),
  ).toBeVisible();

  await page.goto(
    `${appBasePath}/raster/snapshots/${fixture.withBaselineSnapshotId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Manual baseline comparison" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 unchanged, 1 changed, 1 new, 1 missing."),
  ).toBeVisible();

  await page.goto(
    `${appBasePath}/raster/snapshots/${fixture.withoutBaselineSnapshotId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Manual baseline comparison" }),
  ).not.toBeVisible();
});

test("viewer sees a baseline without causing writes", async ({ page }) => {
  const suffix = `${Date.now()}-viewer`;
  const email = `e2e-raster-baseline-${suffix}@example.com`;
  const password = "RasterBaseline123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Baseline Viewer",
    role: Role.SCOPE_USER,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  const fixture = await seedRasterManualBaselineFixture({ email, suffix });
  const before = await countRasterManualBaselines(fixture.readyInputSetId);

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);
  await page.goto(
    `${appBasePath}/raster/review?${query}&workspace=${fixture.readyInputSetId}`,
  );
  await expect(page.getByText("Manual baseline (READY)")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh baseline" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Map", exact: true }),
  ).toHaveCount(0);
  expect(await countRasterManualBaselines(fixture.readyInputSetId)).toBe(
    before,
  );

  const response = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${fixture.readyInputSetId}/baseline`,
    { data: {} },
  );
  expect(response.status()).toBe(403);
});
