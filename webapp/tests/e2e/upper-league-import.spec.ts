import { readFile } from "node:fs/promises";
import path from "node:path";
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

const season = "2026/27";
const importScope = {
  code: "AACHEN_EUREGIO",
  name: "Aachen/Euregio",
};
const constraintScope = {
  code: "RHEIN_RUHR",
  name: "Rhein-Ruhr",
};
const fixture = path.join(
  "..",
  "tests",
  "fixtures",
  "raster",
  "gruppen-und-raster-2026.pdf",
);

test("scheduler imports an upper-league raster PDF and sees the preview on mobile", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-upper-import-${suffix}@example.com`;
  const password = "UpperImport123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Upper Import",
    role: Role.SCOPE_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, importScope);

  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);
  await page.goto(
    `${appBasePath}/raster/import?scope=${importScope.code}&season=${encodeURIComponent(season)}`,
  );

  const form = page
    .locator("form")
    .filter({ hasText: "Upload upper-league raster PDF" });
  await expect(form.getByRole("button", { name: "Upload upper-league PDF" })).toBeVisible();

  const pdf = await readFile(fixture);
  const upload = await page.request.post(
    `${appBasePath}/api/raster/sources/upload`,
    {
      multipart: {
        scopeCode: importScope.code,
        season,
        sourceType: "UPPER_LEAGUE_RASTER",
        file: {
          name: "gruppen-und-raster-2026.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        },
      },
    },
  );
  expect(upload.status()).toBe(201);

  await page.reload();
  await page.getByText("Parsed data: 31 leagues").click();
  await expect(
    page.getByRole("cell", { name: "Verbandsliga 1 Erwachsene" }),
  ).toBeVisible();
  await expect(page.getByText("TuRa Elsen").first()).toBeVisible();
});

test("malformed upper-league uploads fail and non-matching clubs do not inject teams", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-upper-constraints-${suffix}@example.com`;
  const password = "UpperConstraints123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Upper Constraints",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, constraintScope);
  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const malformed = await page.request.post(
    `${appBasePath}/api/raster/sources/upload`,
    {
      multipart: {
        scopeCode: constraintScope.code,
        season,
        sourceType: "UPPER_LEAGUE_RASTER",
        file: {
          name: "broken.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\nnot the expected fixture"),
        },
      },
    },
  );
  expect(malformed.status()).toBe(422);

  const pdf = await readFile(fixture);
  const valid = await page.request.post(
    `${appBasePath}/api/raster/sources/upload`,
    {
      multipart: {
        scopeCode: constraintScope.code,
        season,
        sourceType: "UPPER_LEAGUE_RASTER",
        file: {
          name: "gruppen-und-raster-2026.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        },
      },
    },
  );
  expect(valid.status()).toBe(201);

  const inputSetResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: {
        scope: constraintScope.code,
        season,
        name: `E2E upper ${suffix}`,
      },
    },
  );
  const { inputSet } = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };
  const model = buildNoMatchModel();
  expect(
    await page.request
      .post(`${appBasePath}/api/raster/input-sets/${inputSet.id}/season-model`, {
        data: model,
      })
      .then((response) => response.status()),
  ).toBe(200);
  expect(
    await page.request
      .post(`${appBasePath}/api/raster/input-sets/${inputSet.id}/wishes/json`, {
        data: {
          wishes: [
            {
              clubId: model.clubs[0].id,
              clubName: model.clubs[0].name,
              teamLabel: "I",
              homeWeekday: "FRIDAY",
              hall: "1",
            },
          ],
        },
      })
      .then((response) => response.status()),
  ).toBe(200);

  await page.goto(
    `${appBasePath}/raster/review?scope=${constraintScope.code}&season=${encodeURIComponent(season)}`,
  );
  await page.getByRole("button", { name: "Recheck capacities" }).first().click();
  await expect(page.getByText(/Inferred \d+; \d+ need review/)).toBeVisible();
  await page.getByRole("button", { name: "Mark all reviewed" }).click();
  await expect(page.getByText("Source matches (0 outstanding)")).toBeVisible();
  await page.getByRole("link", { name: /^Run optimizer/ }).click();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/Validation passed/)).toBeVisible();
  await page.getByRole("button", { name: "Queue run" }).click();
  await expect(page.getByText(/Run queued/)).toBeVisible();

  const list = await page.request.get(
    `${appBasePath}/api/raster/input-sets?scope=${constraintScope.code}&season=${encodeURIComponent(season)}`,
  );
  const { inputSets } = (await list.json()) as {
    inputSets: Array<{ id: string; seasonModelJson: string }>;
  };
  const stored = JSON.parse(
    inputSets.find((row) => row.id === inputSet.id)?.seasonModelJson ?? "{}",
  ) as { teams?: Array<{ id: string }> };
  expect(stored.teams?.map((team) => team.id)).toEqual(
    model.teams.map((team) => team.id),
  );
});

function buildNoMatchModel() {
  const clubs = Array.from({ length: 5 }, (_, index) => ({
    id: `no-upper-club-${index + 1}`,
    name: `No Upper Club ${index + 1}`,
    venues: [{ hall: "1", name: "Hall 1", capacity: 1 }],
  }));
  const teams = clubs.map((club, index) => ({
    id: `no-upper-team-${index + 1}`,
    clubId: club.id,
    label: "I",
    homeWeekday: "friday",
    hall: "1",
    rasterzahl: { kind: "assignable" },
    confidence: "ok",
  }));
  return {
    clubs,
    teams,
    groups: [
      {
        ref: { league: "Bezirksliga", name: "Gruppe 1" },
        planningStatus: "include",
        size: 5,
        teamIds: teams.map((team) => team.id),
      },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
}
