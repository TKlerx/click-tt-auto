import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn((callback) => callback(prisma)),
  rasterInputSet: { update: vi.fn(), findUnique: vi.fn() },
  rasterTeamRoster: { findFirst: vi.fn() },
  rasterWishImportBatch: { create: vi.fn() },
  rasterWish: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  rasterImportedWishRow: { create: vi.fn() },
  rasterWishConflict: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma }));

import { importParsedWishes } from "@/services/raster/wishes";

describe("roster matching integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
    });
    prisma.rasterWishImportBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.rasterWish.findMany.mockResolvedValue([]);
    prisma.rasterWish.create.mockResolvedValue({ id: "wish-1" });
    prisma.rasterImportedWishRow.create.mockResolvedValue({ id: "row-1" });
  });

  it("resolves exact roster names and leaves roster non-matches unmatched", async () => {
    prisma.rasterTeamRoster.findFirst.mockResolvedValueOnce({
      teams: [{ vereinName: "SC GW Paderborn", vereinNr: "42706" }],
    });
    const result = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed: {
        clubs: [
          {
            id: "sc-gw-paderborn",
            name: "SC GW Paderborn",
            venues: [],
            notes: "",
          },
          { id: "ghost", name: "Ghost", venues: [], notes: "" },
        ],
        teams: [
          {
            id: "team-1",
            clubId: "sc-gw-paderborn",
            label: "Erwachsene",
            homeWeekday: "friday",
            hall: "1",
            rasterzahl: { kind: "assignable" },
            confidence: "ok",
          },
          {
            id: "team-2",
            clubId: "ghost",
            label: "Erwachsene",
            homeWeekday: "friday",
            hall: "1",
            rasterzahl: { kind: "assignable" },
            confidence: "ok",
          },
        ],
        warnings: [],
      },
    });

    expect(result.unmatched).toBe(1);
    expect(prisma.rasterWish.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rasterWish.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: "42706" }),
    });
  });
});
