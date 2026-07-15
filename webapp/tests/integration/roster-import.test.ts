import { readFile } from "node:fs/promises";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseRosterCsvBytes } from "../../../src/raster/ingest/roster-csv";

const tx = vi.hoisted(() => ({
  rasterTeamRoster: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  rasterRosterTeam: { upsert: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  $transaction: vi.fn((callback) => callback(tx)),
}));

vi.mock("@/lib/db", () => ({ prisma }));

import { importRasterRoster } from "@/services/raster/roster";

const fixture =
  "../data/Tabellen__aktuelle_Tabellen_-_Filter_Meisterschaft__20260715120301.csv";

describe("roster import integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.rasterTeamRoster.findFirst.mockResolvedValue(null);
    tx.rasterTeamRoster.create.mockResolvedValue({ id: "roster-1" });
    tx.rasterTeamRoster.update.mockResolvedValue({ id: "roster-1" });
    tx.rasterRosterTeam.upsert.mockResolvedValue({});
  });

  it("imports the OWL export counts and re-imports without new roster rows", async () => {
    const parsed = parseRosterCsvBytes(await readFile(fixture));
    const summary = await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed,
    });

    expect(summary).toMatchObject({ teams: 404, clubs: 85, groups: 43 });
    expect(tx.rasterRosterTeam.upsert).toHaveBeenCalledTimes(404);

    tx.rasterTeamRoster.findFirst.mockResolvedValue({ id: "roster-1" });
    await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed,
    });

    expect(tx.rasterTeamRoster.create).toHaveBeenCalledTimes(1);
    expect(tx.rasterTeamRoster.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a region mismatch before importing", async () => {
    const parsed = parseRosterCsvBytes(await readFile(fixture));

    await expect(
      importRasterRoster({
        scopeId: "other",
        scopeCode: "OTHER",
        scopeName: "Other",
        season: "2026/27",
        importedById: "user-1",
        parsed,
      }),
    ).rejects.toThrow(/region mismatch/i);
  });
});
