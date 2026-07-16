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

type ReviewConflict = {
  id: string;
  wish: { clubId: string; teamLabel: string | null; startTime: string | null };
  importedRow: { startTime: string | null };
};

// The import maps each returned RasterImportedWishRow back to the row it was
// built from by position, which assumes createManyAndReturn hands rows back in
// input order. Unit tests mock Prisma and cannot see that. These run against
// the real Postgres the E2E database provisions, with enough rows that a
// reordering would attach conflicts to the wrong team.
const WISHES = Array.from({ length: 6 }, (_, index) => ({
  clubId: `club-${index + 1}`,
  clubName: `Club ${index + 1}`,
  teamLabel: "I",
  homeWeekday: "FRIDAY",
  hall: "1",
  startTime: `19:0${index}`,
}));

test("a re-import raises a conflict against the team it actually changed", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-wish-import-${suffix}@example.com`;
  const password = "WishImport123";

  await seedLocalUser({
    email,
    name: "E2E Wish Importer",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const inputSetResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets`,
    { data: { scope: scopeCode, season, name: `E2E wish import ${suffix}` } },
  );
  expect(inputSetResponse.status()).toBe(201);
  const { inputSet } = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };

  const importWishes = (wishes: unknown[]) =>
    page.request.post(
      `${appBasePath}/api/raster/input-sets/${inputSet.id}/wishes/json`,
      { data: { wishes } },
    );
  const review = async () => {
    const response = await page.request.get(
      `${appBasePath}/api/raster/input-sets/${inputSet.id}/wish-imports`,
    );
    expect(response.status()).toBe(200);
    return (await response.json()) as {
      conflicts: ReviewConflict[];
      addedWishes: { clubId: string }[];
    };
  };

  // First import: every team is new, so nothing conflicts.
  const first = await importWishes(WISHES);
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({
    added: WISHES.length,
    conflicts: 0,
  });

  const afterFirst = await review();
  expect(afterFirst.conflicts).toEqual([]);
  expect(afterFirst.addedWishes).toHaveLength(WISHES.length);

  // Re-importing the identical payload must stay silent (FR-004a/FR-006).
  const repeat = await importWishes(WISHES);
  expect(await repeat.json()).toMatchObject({ added: 0, conflicts: 0 });
  expect((await review()).conflicts).toEqual([]);

  // Change exactly one team, in the middle of the batch rather than at either
  // end, where an off-by-one or a reordering would still look correct.
  const changed = WISHES.map((wish, index) =>
    index === 3 ? { ...wish, startTime: "20:45" } : wish,
  );
  const third = await importWishes(changed);
  expect(await third.json()).toMatchObject({ added: 0, conflicts: 1 });

  const afterChange = await review();
  expect(afterChange.conflicts).toHaveLength(1);
  const conflict = afterChange.conflicts[0];
  // The conflict must name club-4 -- the team whose value actually moved.
  expect(conflict.wish.clubId).toBe("club-4");
  expect(conflict.wish.startTime).toBe("19:03");
  expect(conflict.importedRow.startTime).toBe("20:45");

  // Keeping the existing value must leave the wish alone and settle the
  // conflict, and re-importing the same value must not ask twice (FR-004a).
  const decision = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSet.id}/wish-imports/conflicts/${conflict.id}`,
    { data: { decision: "KEEP_EXISTING" } },
  );
  expect(decision.status()).toBe(200);
  expect((await review()).conflicts).toEqual([]);

  const fourth = await importWishes(changed);
  expect(await fourth.json()).toMatchObject({ conflicts: 0 });
  expect((await review()).conflicts).toEqual([]);
});

test("using the imported value records what it replaced", async ({ page }) => {
  const suffix = Date.now();
  const email = `e2e-wish-decision-${suffix}@example.com`;
  const password = "WishDecision123";

  await seedLocalUser({
    email,
    name: "E2E Wish Decider",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const inputSetResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets`,
    { data: { scope: scopeCode, season, name: `E2E wish decide ${suffix}` } },
  );
  const { inputSet } = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };

  const base = [
    {
      clubId: "club-1",
      clubName: "Club 1",
      teamLabel: "I",
      homeWeekday: "FRIDAY",
      hall: "1",
      startTime: "19:30",
    },
  ];
  await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSet.id}/wishes/json`,
    { data: { wishes: base } },
  );
  await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSet.id}/wishes/json`,
    { data: { wishes: [{ ...base[0], startTime: "19:00" }] } },
  );

  const listResponse = await page.request.get(
    `${appBasePath}/api/raster/input-sets/${inputSet.id}/wish-imports`,
  );
  const { conflicts } = (await listResponse.json()) as {
    conflicts: ReviewConflict[];
  };
  expect(conflicts).toHaveLength(1);

  const decision = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSet.id}/wish-imports/conflicts/${conflicts[0].id}`,
    { data: { decision: "USE_IMPORTED" } },
  );
  expect(decision.status()).toBe(200);
  const { conflict } = (await decision.json()) as {
    conflict: { previousValueJson: string; decidedValueJson: string };
  };

  // FR-010: the trail keeps the value the decision replaced, not only the one
  // it chose.
  expect(JSON.parse(conflict.previousValueJson).startTime).toBe("19:30");
  expect(JSON.parse(conflict.decidedValueJson).startTime).toBe("19:00");
});
