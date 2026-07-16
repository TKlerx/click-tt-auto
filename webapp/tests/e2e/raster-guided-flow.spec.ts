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
  seedRasterScopeHierarchy,
} from "./helpers/db";

const scopeCode = "OWL";
const scope = { code: scopeCode, name: "Ostwestfalen-Lippe" };

test("guided raster flow keeps exclusions provisional and easy to include", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-raster-guided-${suffix}@example.com`;
  const password = "RasterGuided123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Guided",
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
      data: {
        scope: scopeCode,
        season: "2026/27",
        name: `Guided exclusions ${suffix}`,
      },
    },
  );
  expect(inputSetResponse.status()).toBe(201);
  const inputSetBody = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };

  const modelResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSetBody.inputSet.id}/season-model`,
    {
      data: {
        clubs: [{ id: "club-1", name: "Club 1", venues: [], notes: "" }],
        teams: [
          {
            id: "team-1",
            clubId: "club-1",
            label: "I",
            capacityRelevant: false,
          },
        ],
        groups: [
          {
            id: "group-1",
            ref: { league: "Liga", name: "Gruppe 1" },
            size: 7,
            planningStatus: "exclude",
            teamIds: ["team-1"],
          },
        ],
        wishes: [],
        absoluteConstraints: [],
        warnings: [],
      },
    },
  );
  expect(modelResponse.status()).toBe(200);

  await page.goto(
    `${appBasePath}/raster/run?scope=${scopeCode}&season=2026%2F27`,
  );
  await expect(
    page.getByText(/provisional because excluded groups/),
  ).toBeVisible();
  await expect(page.getByText(/exclusions/).first()).toBeVisible();

  await page.goto(
    `${appBasePath}/raster/review?scope=${scopeCode}&season=2026%2F27`,
  );
  await page.getByText(/Group planning and wish matches/).click();
  await expect(page.getByText("excluded, deferred")).toBeVisible();
  await page.getByRole("button", { name: "Include" }).click();
  await expect(page.getByText("included")).toBeVisible();
});
