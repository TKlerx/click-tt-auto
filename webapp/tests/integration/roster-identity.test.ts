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

describe("roster identity integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.rasterTeamRoster.findFirst.mockResolvedValue({ id: "roster-1" });
    tx.rasterTeamRoster.update.mockResolvedValue({ id: "roster-1" });
    tx.rasterRosterTeam.findMany.mockResolvedValue([]);
    tx.rasterRosterTeam.createMany.mockResolvedValue({ count: 0 });
    tx.rasterRosterTeam.update.mockResolvedValue({});
    tx.rasterRosterTeam.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("renames a stored team in place when its VereinNr still matches", async () => {
    tx.rasterRosterTeam.findMany.mockResolvedValue([
      {
        id: "team-1",
        vereinNr: "42706",
        vereinName: "SC Grün-Weiß Paderborn",
        altersklasse: "Erwachsene",
        mannschaftNr: "1",
        liga: "Liga",
        gruppe: "Gruppe",
      },
    ]);

    await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed: {
        charset: "utf-8",
        rows: [
          {
            region: "Ostwestfalen/Lippe",
            season: "2026/27",
            liga: "Liga",
            gruppe: "Gruppe",
            vereinNr: "42706",
            vereinName: "SC GW Paderborn",
            altersklasse: "Erwachsene",
            mannschaftNr: "1",
          },
        ],
      },
    });

    // Same row keeps its id: identity is the VereinNr, not the spelling.
    expect(tx.rasterRosterTeam.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { vereinName: "SC GW Paderborn", liga: "Liga", gruppe: "Gruppe" },
    });
    expect(tx.rasterRosterTeam.createMany).not.toHaveBeenCalled();
  });

  it("keeps club identity by VereinNr while updating the label", async () => {
    await importRasterRoster({
      scopeId: "owl",
      scopeCode: "OWL",
      scopeName: "Ostwestfalen/Lippe",
      season: "2026/27",
      importedById: "user-1",
      parsed: {
        charset: "utf-8",
        rows: [
          {
            region: "Ostwestfalen/Lippe",
            season: "2026/27",
            liga: "Liga",
            gruppe: "Gruppe",
            vereinNr: "42706",
            vereinName: "SC Gruen-Weiss Paderborn",
            altersklasse: "Erwachsene",
            mannschaftNr: "1",
          },
          {
            region: "Ostwestfalen/Lippe",
            season: "2026/27",
            liga: "Liga",
            gruppe: "Gruppe",
            vereinNr: "42706",
            vereinName: "SC GW Paderborn",
            altersklasse: "Erwachsene",
            mannschaftNr: "6",
          },
        ],
      },
    });

    const [[created]] = tx.rasterRosterTeam.createMany.mock.calls;
    expect(created.data).toEqual([
      expect.objectContaining({
        rosterId: "roster-1",
        vereinNr: "42706",
        vereinName: "SC Gruen-Weiss Paderborn",
        mannschaftNr: "1",
      }),
      expect.objectContaining({
        rosterId: "roster-1",
        vereinNr: "42706",
        vereinName: "SC GW Paderborn",
        mannschaftNr: "6",
      }),
    ]);
  });
});
