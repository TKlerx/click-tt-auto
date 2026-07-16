import { describe, expect, it, vi, beforeEach } from "vitest";

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

const parsed = {
  charset: "utf-8" as const,
  rows: [
    {
      region: "Ostwestfalen/Lippe",
      season: "2026/27",
      liga: "Liga A",
      gruppe: "Gruppe A",
      vereinNr: "42706",
      vereinName: "SC GW Paderborn",
      altersklasse: "Erwachsene",
      mannschaftNr: "1",
    },
    {
      region: "Ostwestfalen/Lippe",
      season: "2026/27",
      liga: "Liga B",
      gruppe: "Gruppe B",
      vereinNr: "42706",
      vereinName: "SC GW Paderborn",
      altersklasse: "Erwachsene",
      mannschaftNr: "2",
    },
  ],
};

describe("raster roster service", () => {
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

  it("imports rows as canonical roster teams", async () => {
    const summary = await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed,
    });

    expect(summary).toEqual({
      rosterId: "roster-1",
      teams: 2,
      clubs: 1,
      groups: 2,
      charset: "utf-8",
    });
    expect(tx.rasterRosterTeam.createMany).toHaveBeenCalledTimes(1);
    expect(tx.rasterRosterTeam.createMany).toHaveBeenCalledWith({
      data: [
        {
          rosterId: "roster-1",
          vereinNr: "42706",
          vereinName: "SC GW Paderborn",
          altersklasse: "Erwachsene",
          mannschaftNr: "1",
          liga: "Liga A",
          gruppe: "Gruppe A",
        },
        {
          rosterId: "roster-1",
          vereinNr: "42706",
          vereinName: "SC GW Paderborn",
          altersklasse: "Erwachsene",
          mannschaftNr: "2",
          liga: "Liga B",
          gruppe: "Gruppe B",
        },
      ],
    });
  });

  it("reuses the latest roster on re-import", async () => {
    tx.rasterTeamRoster.findFirst.mockResolvedValue({ id: "roster-1" });

    await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed,
    });

    expect(tx.rasterTeamRoster.create).not.toHaveBeenCalled();
    expect(tx.rasterTeamRoster.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "roster-1" } }),
    );
  });

  it("rejects region mismatches before writing", async () => {
    await expect(
      importRasterRoster({
        scopeId: "westfalen",
        scopeCode: "WESTFALEN_MITTE",
        scopeName: "Westfalen-Mitte",
        season: "2026/27",
        importedById: "user-1",
        parsed,
      }),
    ).rejects.toThrow(/region mismatch/i);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
