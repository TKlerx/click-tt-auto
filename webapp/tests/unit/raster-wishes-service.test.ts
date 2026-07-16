import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  importParsedWishes,
  listWishImportReview,
  matchImportedWishRow,
  resolveWishConflict,
} from "@/services/raster";

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

  it("records the value a decision replaced, not just the one it chose", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterWishConflict.findFirst.mockResolvedValue({
      id: "conflict-1",
      wishId: "wish-1",
      wish: {
        id: "wish-1",
        clubId: "club-a",
        clubName: "Club A",
        teamLabel: "I",
        homeWeekday: "MONDAY",
        hall: "1",
        startTime: "19:30",
        spielwochePref: null,
        requestedRasterzahl: null,
        notes: null,
      },
      importedRow: {
        clubId: "club-a",
        clubName: "Club A",
        teamLabel: "I",
        homeWeekday: "MONDAY",
        hall: "1",
        startTime: "19:00",
        spielwochePref: null,
        requestedRasterzahl: null,
        notes: null,
      },
    } as never);
    prismaMock.rasterWish.update.mockResolvedValue({ id: "wish-1" } as never);
    prismaMock.rasterWishConflict.update.mockResolvedValue({
      id: "conflict-1",
    } as never);

    await resolveWishConflict({
      inputSetId: "input-1",
      conflictId: "conflict-1",
      actorId: "user-1",
      decision: "USE_IMPORTED" as never,
    });

    const update = prismaMock.rasterWishConflict.update.mock.calls[0]?.[0] as {
      data: { previousValueJson: string; decidedValueJson: string };
    };
    // The admin's 19:30 is what USE_IMPORTED overwrote; it must survive.
    expect(JSON.parse(update.data.previousValueJson).startTime).toBe("19:30");
    expect(JSON.parse(update.data.decidedValueJson).startTime).toBe("19:00");
  });

  it("pairs an unmatched row with an existing wish instead of duplicating it", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    const importedRow = {
      id: "row-1",
      inputSetId: "input-1",
      batch: { sourceKind: "PDF" },
      clubId: "42706",
      clubName: "SC GW Paderborn",
      teamLabel: "I",
      homeWeekday: "FRIDAY",
      hall: "2",
      startTime: "20:00",
      spielwochePref: null,
      requestedRasterzahl: null,
      notes: null,
      valueFingerprint: "fp-1",
    };
    prismaMock.rasterImportedWishRow.findFirst.mockResolvedValue(
      importedRow as never,
    );
    // A wish for this team appeared after the row was flagged unmatched.
    prismaMock.rasterWish.findFirst.mockResolvedValue({
      id: "wish-existing",
      clubId: "42706",
      teamLabel: "I",
      homeWeekday: "FRIDAY",
      hall: "2",
      startTime: "20:00",
      spielwochePref: null,
      requestedRasterzahl: null,
      notes: null,
    } as never);
    prismaMock.rasterImportedWishRow.update.mockResolvedValue({
      ...importedRow,
      matchedWishId: "wish-existing",
    } as never);

    const row = await matchImportedWishRow({
      inputSetId: "input-1",
      rowId: "row-1",
      actorId: "user-1",
    });

    expect(prismaMock.rasterWish.create).not.toHaveBeenCalled();
    expect(row?.matchedWishId).toBe("wish-existing");
  });

  it("marks only the row that created a wish as having added it", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(null);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([] as never);
    // club-b already has a wish; club-a does not.
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wish-b",
        clubId: "club-b",
        clubName: "Club B",
        teamLabel: "I",
        homeWeekday: "MONDAY",
        hall: "1",
        startTime: "19:00",
        spielwochePref: null,
        requestedRasterzahl: null,
        notes: null,
      },
    ] as never);
    prismaMock.rasterWish.createManyAndReturn.mockResolvedValue([
      { id: "wish-a", clubId: "club-a", teamLabel: "I" },
    ] as never);
    prismaMock.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-a" },
      { id: "row-b" },
    ] as never);

    const team = (clubId: string) => ({
      id: `${clubId}-1`,
      clubId,
      label: "I",
      homeWeekday: "monday" as const,
      hall: "1",
      startTime: "19:00",
      rasterzahl: { kind: "assignable" as const },
      confidence: "ok" as const,
    });

    await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed: {
        clubs: [
          { id: "club-a", name: "Club A", venues: [], notes: "" },
          { id: "club-b", name: "Club B", venues: [], notes: "" },
        ],
        teams: [team("club-a"), team("club-b")],
        warnings: [],
      },
    });

    const rows = firstCallData(prismaMock.rasterImportedWishRow.createManyAndReturn);
    // club-a's row brought its wish into existence; club-b's only matched one.
    expect(rows.map((row) => row.createdWish)).toEqual([true, false]);
  });

  it("collapses repeated unmatched rows for the same team into one item", async () => {
    prismaMock.rasterWishImportBatch.findMany.mockResolvedValue([] as never);
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([] as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([] as never);
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(null);
    // The same ghost club re-imported on three separate runs.
    prismaMock.rasterImportedWishRow.findMany.mockResolvedValue([
      { id: "row-3", clubId: "ghost", teamLabel: "Erwachsene" },
      { id: "row-2", clubId: "ghost", teamLabel: "Erwachsene" },
      { id: "row-1", clubId: "ghost", teamLabel: " erwachsene " },
    ] as never);

    const review = await listWishImportReview("input-1");

    expect(review.unmatchedRows.map((row) => row.id)).toEqual(["row-3"]);
  });
});
