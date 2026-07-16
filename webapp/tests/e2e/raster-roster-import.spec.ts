import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import { appBasePath, expectOnDashboard, loginWithPassword } from "./helpers/auth";
import {
  assignUserToScope,
  seedLocalUser,
  seedRasterScopeHierarchy,
} from "./helpers/db";

const scopeCode = "OWL";
const scope = { code: scopeCode, name: "Ostwestfalen/Lippe" };
const fixture = path.join(
  "..",
  "data",
  "Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv",
);

test("imports the nuLiga roster export into PostgreSQL and re-imports it cleanly", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-raster-roster-${suffix}@example.com`;
  const password = "RasterRoster123";

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Roster",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const csv = await readFile(fixture);
  const upload = async () =>
    page.request.post(`${appBasePath}/api/raster/sources/upload`, {
      multipart: {
        scopeCode,
        season: "2026/27",
        sourceType: "ROSTER_CSV",
        displayName: `Tabellen ${suffix}`,
        file: {
          name: "tabellen.csv",
          mimeType: "text/csv",
          buffer: csv,
        },
      },
    });

  const first = await upload();
  expect(first.status()).toBe(201);
  const firstBody = (await first.json()) as {
    source: { parsedJson: string | null };
  };
  expect(JSON.parse(firstBody.source.parsedJson ?? "{}")).toMatchObject({
    teams: 404,
    clubs: 85,
    groups: 43,
    charset: "utf-8",
  });

  // Re-import must survive the real unique constraint rather than duplicating.
  const second = await upload();
  expect(second.status()).toBe(201);

  const rosterResponse = await page.request.get(
    `${appBasePath}/api/raster/roster?scope=${scopeCode}&season=2026%2F27`,
  );
  expect(rosterResponse.status()).toBe(200);
  const { roster } = (await rosterResponse.json()) as {
    roster: {
      charset: string;
      teams: { vereinNr: string; vereinName: string }[];
    };
  };

  expect(roster.teams).toHaveLength(404);
  expect(roster.charset).toBe("UTF8");
  // Umlauts must survive the CSV -> Postgres -> JSON round trip intact.
  expect(
    roster.teams.find((team) => team.vereinNr === "42522")?.vereinName,
  ).toBe("TTV Grün-Weiß Daseburg");
});
