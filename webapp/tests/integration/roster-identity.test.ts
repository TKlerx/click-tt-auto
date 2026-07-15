import { describe, expect, it, vi, beforeEach } from "vitest";

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

describe("roster identity integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.rasterTeamRoster.findFirst.mockResolvedValue({ id: "roster-1" });
    tx.rasterTeamRoster.update.mockResolvedValue({ id: "roster-1" });
    tx.rasterRosterTeam.upsert.mockResolvedValue({});
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

    expect(tx.rasterRosterTeam.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rosterId_vereinNr_altersklasse_mannschaftNr: expect.objectContaining({
            vereinNr: "42706",
            mannschaftNr: "1",
          }),
        }),
        update: expect.objectContaining({
          vereinName: "SC Gruen-Weiss Paderborn",
        }),
      }),
    );
    expect(tx.rasterRosterTeam.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rosterId_vereinNr_altersklasse_mannschaftNr: expect.objectContaining({
            vereinNr: "42706",
            mannschaftNr: "6",
          }),
        }),
      }),
    );
  });
});
