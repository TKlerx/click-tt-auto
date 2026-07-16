import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { importParsedWishes } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster wishes import service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates parsed rows and opens an import batch instead of deleting wishes", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(null);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([]);
    prismaMock.rasterWish.create.mockResolvedValue({ id: "wish-1" } as never);
    prismaMock.rasterImportedWishRow.create.mockResolvedValue({
      id: "row-1",
    } as never);

    await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed: {
        clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
        teams: [
          {
            id: "club-a-1",
            clubId: "club-a",
            label: "Erwachsene II",
            homeWeekday: "monday",
            hall: "1",
            startTime: "19:45",
            spielwochePref: "A",
            rasterzahl: { kind: "assignable" },
            confidence: "review",
          },
          {
            id: "club-a-1-duplicate",
            clubId: "club-a",
            label: "Erwachsene II",
            homeWeekday: "monday",
            hall: "1",
            startTime: "19:45",
            spielwochePref: "A",
            rasterzahl: { kind: "assignable" },
            confidence: "review",
          },
        ],
        warnings: [],
      },
    });

    expect(prismaMock.rasterWish.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.rasterWishImportBatch.create).toHaveBeenCalled();
    expect(prismaMock.rasterImportedWishRow.create).toHaveBeenCalledTimes(1);
  });
});
