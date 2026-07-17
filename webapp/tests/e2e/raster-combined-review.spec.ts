import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "./helpers/auth";
import {
  assignUserToScope,
  seedLocalUser,
  seedRasterCombinedReviewFixture,
  seedRasterScopeHierarchy,
} from "./helpers/db";

const scope = { code: "OWL", name: "Ostwestfalen/Lippe" };

test("combined raster review shows independent markings and narrows by scope", async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const email = `e2e-raster-combined-review-${suffix}@example.com`;
  const password = "RasterReview123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Combined Review",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  const fixture = await seedRasterCombinedReviewFixture({ email, suffix });

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  await page.goto(`${appBasePath}/raster/run?scope=OWL&season=2026%2F27`);
  await expect(page.getByText("Combined")).toHaveCount(2);
  await expect(page.getByText("Incomplete")).toHaveCount(1);

  await page.goto(
    `${appBasePath}/raster/snapshots/${fixture.combinedSnapshotId}`,
  );
  await expect(page.getByText("Combined")).toBeVisible();
  await expect(page.getByText("Incomplete")).toBeVisible();
  await expect(page.getByText("OWL Club")).toBeVisible();
  await expect(page.getByText("Westfalen Club")).toBeVisible();

  await page
    .locator('select[name="scope"]')
    .selectOption(fixture.westfalenScopeId);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Westfalen Club")).toBeVisible();
  await expect(page.getByText("OWL Club")).not.toBeVisible();

  await page.goto(
    `${appBasePath}/raster/snapshots/${fixture.completeCombinedSnapshotId}`,
  );
  await expect(page.getByText("Combined")).toBeVisible();
  await expect(page.getByText("Incomplete")).not.toBeVisible();

  await page.goto(
    `${appBasePath}/raster/snapshots/${fixture.singleSnapshotId}`,
  );
  await expect(page.getByText("Combined")).not.toBeVisible();
});
