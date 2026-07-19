import { expect, test, type Page } from "@playwright/test";
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

async function seedRasterUser(input: {
  email: string;
  name: string;
  role: Role;
  password: string;
}) {
  await seedLocalUser({
    ...input,
    mustChangePassword: false,
  });
  await assignUserToScope(input.email, scope);
}

async function login(page: Page, email: string, password: string) {
  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);
  return page.request;
}

test("raster role matrix allows admin, scheduler, and viewer actions correctly", async ({
  browser,
}) => {
  const suffix = Date.now();
  const adminEmail = `e2e-raster-admin-${suffix}@example.com`;
  const schedulerEmail = `e2e-raster-scheduler-${suffix}@example.com`;
  const viewerEmail = `e2e-raster-viewer-${suffix}@example.com`;

  await seedRasterUser({
    email: adminEmail,
    name: "E2E Raster Admin",
    role: Role.PLATFORM_ADMIN,
    password: "RasterAdmin123",
  });
  await seedRasterUser({
    email: schedulerEmail,
    name: "E2E Raster Scheduler",
    role: Role.SCOPE_ADMIN,
    password: "RasterScheduler123",
  });
  await seedRasterUser({
    email: viewerEmail,
    name: "E2E Raster Viewer",
    role: Role.SCOPE_USER,
    password: "RasterViewer123",
  });

  const adminPage = await browser.newPage();
  const adminRequest = await login(adminPage, adminEmail, "RasterAdmin123");
  const inputSetResponse = await adminRequest.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: { scope: scopeCode, season, name: `OWL role matrix ${suffix}` },
    },
  );
  expect(inputSetResponse.status()).toBe(201);
  const inputSetBody = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };

  const snapshotResponse = await adminRequest.post(
    `${appBasePath}/api/raster/snapshots/import`,
    {
      data: {
        scope: scopeCode,
        assignments: [
          {
            league: "Bezirksoberliga",
            group: "1",
            clubId: "club-e2e",
            clubName: "E2E Club",
            team: "E2E Club I",
            rasterzahl: 1,
            status: "OPTIMIZED",
            weekday: "FRIDAY",
            hall: "1",
          },
        ],
        conflicts: [],
      },
    },
  );
  expect(snapshotResponse.status()).toBe(201);
  const snapshotBody = (await snapshotResponse.json()) as {
    snapshot: { id: string };
  };
  await adminPage.close();

  const schedulerPage = await browser.newPage();
  const schedulerRequest = await login(
    schedulerPage,
    schedulerEmail,
    "RasterScheduler123",
  );
  const schedulerList = await schedulerRequest.get(
    `${appBasePath}/api/raster/input-sets?scope=${scopeCode}&season=${encodeURIComponent(season)}`,
  );
  expect(schedulerList.status()).toBe(200);

  const schedulerInputCreate = await schedulerRequest.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: { scope: scopeCode, season, name: "blocked scheduler input set" },
    },
  );
  expect(schedulerInputCreate.status()).toBe(201);

  const schedulerWishesUpload = await schedulerRequest.post(
    `${appBasePath}/api/raster/input-sets/${inputSetBody.inputSet.id}/wishes/json`,
    {
      data: { wishes: [] },
    },
  );
  expect(schedulerWishesUpload.status()).toBe(200);

  const schedulerRunStart = await schedulerRequest.post(
    `${appBasePath}/api/raster/input-sets/${inputSetBody.inputSet.id}/runs`,
    {
      data: {},
    },
  );
  expect(schedulerRunStart.status()).not.toBe(403);

  const schedulerCapacityUpload = await schedulerRequest.post(
    `${appBasePath}/api/raster/capacity/upload`,
    {
      multipart: {
        file: {
          name: "capacity.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "scope,clubId,hall,weekday,capacity\nOWL,club-e2e,1,FRIDAY,2\n",
          ),
        },
      },
    },
  );
  expect(schedulerCapacityUpload.status()).toBe(200);

  const schedulerDecision = await schedulerRequest.post(
    `${appBasePath}/api/raster/snapshots/${snapshotBody.snapshot.id}/decisions`,
    {
      data: {
        targetType: "CLUB_SUMMARY",
        targetId: "club-e2e",
        status: "REVIEWED",
      },
    },
  );
  expect(schedulerDecision.status()).toBe(201);

  const schedulerUserCreate = await schedulerRequest.post(
    `${appBasePath}/api/users`,
    {
      data: {
        email: `blocked-scheduler-${suffix}@example.com`,
        name: "Blocked Scheduler User",
        role: Role.SCOPE_USER,
        temporaryPassword: "BlockedUser123",
      },
    },
  );
  expect(schedulerUserCreate.status()).toBe(403);
  await schedulerPage.close();

  const viewerPage = await browser.newPage();
  const viewerRequest = await login(viewerPage, viewerEmail, "RasterViewer123");
  const viewerList = await viewerRequest.get(
    `${appBasePath}/api/raster/input-sets?scope=${scopeCode}&season=${encodeURIComponent(season)}`,
  );
  expect(viewerList.status()).toBe(200);

  const viewerInputCreate = await viewerRequest.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: { scope: scopeCode, season, name: "blocked viewer input set" },
    },
  );
  expect(viewerInputCreate.status()).toBe(403);

  const viewerCapacityUpload = await viewerRequest.post(
    `${appBasePath}/api/raster/capacity/upload`,
    {
      multipart: {
        file: {
          name: "capacity.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "scope,clubId,hall,weekday,capacity\nOWL,club-e2e,1,FRIDAY,2\n",
          ),
        },
      },
    },
  );
  expect(viewerCapacityUpload.status()).toBe(403);

  const viewerDecision = await viewerRequest.post(
    `${appBasePath}/api/raster/snapshots/${snapshotBody.snapshot.id}/decisions`,
    {
      data: {
        targetType: "CLUB_SUMMARY",
        targetId: "club-e2e",
        status: "REVIEWED",
      },
    },
  );
  expect(viewerDecision.status()).toBe(403);
  await viewerPage.close();
});
