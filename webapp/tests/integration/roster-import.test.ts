import { readFile } from "node:fs/promises";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseRosterCsvBytes } from "../../../src/raster/ingest/roster-csv";

const tx = vi.hoisted(() => ({
  rasterTeamRoster: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  rasterRosterTeam: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
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
    tx.rasterRosterTeam.findMany.mockResolvedValue([]);
    tx.rasterRosterTeam.createMany.mockResolvedValue({ count: 0 });
    tx.rasterRosterTeam.update.mockResolvedValue({});
    tx.rasterRosterTeam.deleteMany.mockResolvedValue({ count: 0 });
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
    // All 404 rows land in one statement, not 404 round-trips.
    expect(tx.rasterRosterTeam.createMany).toHaveBeenCalledTimes(1);
    const [[created]] = tx.rasterRosterTeam.createMany.mock.calls;
    expect(created.data).toHaveLength(404);

    // Re-importing the same export must not write a single team row.
    vi.clearAllMocks();
    tx.rasterTeamRoster.findFirst.mockResolvedValue({ id: "roster-1" });
    tx.rasterTeamRoster.update.mockResolvedValue({ id: "roster-1" });
    tx.rasterRosterTeam.findMany.mockResolvedValue(
      created.data.map((row: Record<string, string>, index: number) => ({
        ...row,
        id: `team-${index}`,
      })),
    );

    await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed,
    });

    expect(tx.rasterTeamRoster.create).not.toHaveBeenCalled();
    expect(tx.rasterTeamRoster.update).toHaveBeenCalledTimes(1);
    expect(tx.rasterRosterTeam.createMany).not.toHaveBeenCalled();
    expect(tx.rasterRosterTeam.update).not.toHaveBeenCalled();
    expect(tx.rasterRosterTeam.deleteMany).not.toHaveBeenCalled();
  });

  it("drops a team that the new export no longer lists", async () => {
    const parsed = parseRosterCsvBytes(await readFile(fixture));
    tx.rasterTeamRoster.findFirst.mockResolvedValue({ id: "roster-1" });
    tx.rasterRosterTeam.findMany.mockResolvedValue([
      // A team that withdrew: stored, but absent from the export.
      {
        id: "team-withdrawn",
        vereinNr: "99999",
        vereinName: "TTC Aufgelöst",
        altersklasse: "Erwachsene",
        mannschaftNr: "1",
        liga: "Liga",
        gruppe: "Gruppe",
      },
    ]);

    const summary = await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed,
    });

    expect(tx.rasterRosterTeam.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["team-withdrawn"] } },
    });
    // The roster mirrors the export, so the summary matches what is stored.
    expect(summary.teams).toBe(404);
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
