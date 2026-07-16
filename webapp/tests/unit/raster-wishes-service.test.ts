import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { importParsedWishes } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

// The `data` array handed to the first call of a bulk-write mock.
function firstCallData(mock: { mock: { calls: unknown[][] } }) {
  const call = mock.mock.calls[0]?.[0] as { data: Record<string, unknown>[] };
  return call.data;
}

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
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([]);
    prismaMock.rasterWish.createManyAndReturn.mockResolvedValue([
      { id: "wish-1", clubId: "club-a", teamLabel: "Erwachsene II" },
    ] as never);
    prismaMock.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-1" },
    ] as never);

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
    expect(firstCallData(prismaMock.rasterImportedWishRow.createManyAndReturn))
      .toHaveLength(1);
  });

  it("stores requestedRasterzahl as a single-encoded JSON array", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(null);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([]);
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([]);
    prismaMock.rasterWish.createManyAndReturn.mockResolvedValue([
      { id: "wish-1", clubId: "club-a", teamLabel: "Erwachsene II" },
    ] as never);
    prismaMock.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-1" },
    ] as never);

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
            requestedRasterzahl: [3, 8],
            confidence: "ok",
          },
        ],
        warnings: [],
      },
    });

    const stored = firstCallData(prismaMock.rasterWish.createManyAndReturn);
    expect(stored[0].requestedRasterzahl).toBe("[3,8]");
    expect(JSON.parse(String(stored[0].requestedRasterzahl))).toEqual([3, 8]);
  });

  it("re-importing an unchanged requestedRasterzahl raises no conflict", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(null);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([]);
    prismaMock.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-1" },
    ] as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([]);
    prismaMock.rasterWish.createManyAndReturn.mockResolvedValue([
      { id: "wish-1", clubId: "club-a", teamLabel: "Erwachsene II" },
    ] as never);

    const parsed = {
      clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
      teams: [
        {
          id: "club-a-1",
          clubId: "club-a",
          label: "Erwachsene II",
          homeWeekday: "monday" as const,
          hall: "1",
          startTime: "19:45",
          spielwochePref: "A" as const,
          rasterzahl: { kind: "assignable" as const },
          requestedRasterzahl: [3, 8] as never,
          confidence: "ok" as const,
        },
      ],
      warnings: [],
    };

    const first = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed,
    });
    expect(first.added).toBe(1);

    // Feed back exactly what the first import wrote, as the next sync would read it.
    const written = firstCallData(prismaMock.rasterWish.createManyAndReturn);
    prismaMock.rasterWish.findMany.mockResolvedValue([
      { id: "wish-1", clubName: "Club A", notes: null, ...written[0] },
    ] as never);

    const second = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed,
    });

    expect(second.conflicts).toBe(0);
    expect(second.noops).toBe(1);
    expect(prismaMock.rasterWishConflict.createMany).not.toHaveBeenCalled();
  });
});
