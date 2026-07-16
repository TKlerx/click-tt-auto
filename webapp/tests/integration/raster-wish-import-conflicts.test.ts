import { beforeEach, describe, expect, it, vi } from "vitest";
import { fingerprintWishValue } from "@/lib/raster/wish-diff";
import { RasterWeekday } from "../../generated/prisma/enums";

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn((callback) => callback(prisma)),
  rasterInputSet: { update: vi.fn(), findUnique: vi.fn() },
  rasterTeamRoster: { findFirst: vi.fn() },
  rasterWishImportBatch: { create: vi.fn(), findMany: vi.fn() },
  rasterWish: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createManyAndReturn: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  rasterImportedWishRow: {
    create: vi.fn(),
    createManyAndReturn: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  rasterWishConflict: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma }));

import {
  importParsedWishes,
  listWishImportReview,
  matchImportedWishRow,
} from "@/services/raster/wishes";

const activeWish = {
  id: "wish-1",
  inputSetId: "input-1",
  clubId: "club-a",
  clubName: "Club A",
  teamLabel: "I",
  homeWeekday: RasterWeekday.MONDAY,
  hall: "1",
  startTime: "19:00",
  spielwochePref: null,
  requestedRasterzahl: null,
  notes: null,
  source: "PDF_PARSED",
  confidence: "OK",
  origin: "MANUAL",
  reviewedAt: new Date(),
  reviewedById: "user-1",
};

const parsed = {
  clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
  teams: [
    {
      id: "team-1",
      clubId: "club-a",
      label: "I",
      homeWeekday: "friday" as const,
      hall: "2",
      startTime: "20:00",
      rasterzahl: { kind: "assignable" as const },
      confidence: "ok" as const,
    },
  ],
  warnings: [],
};

// The value the parsed fixture imports, keyed exactly as the service keys it.
const importedFingerprint = fingerprintWishValue({
  homeWeekday: "FRIDAY",
  hall: "2",
  startTime: "20:00",
});

describe("raster wish import conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "scope-1",
      season: "2026/27",
      wishesJson: JSON.stringify(parsed),
    });
    prisma.rasterTeamRoster.findFirst.mockResolvedValue(null);
    prisma.rasterWishImportBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.rasterWishImportBatch.findMany.mockResolvedValue([]);
    prisma.rasterImportedWishRow.create.mockResolvedValue({
      id: "row-1",
      valueFingerprint: "fp-1",
    });
    prisma.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-1", valueFingerprint: importedFingerprint },
    ]);
    prisma.rasterImportedWishRow.findMany.mockResolvedValue([]);
    prisma.rasterWishConflict.findMany.mockResolvedValue([]);
    prisma.rasterWishConflict.findFirst.mockResolvedValue(null);
  });

  it("keeps a corrected wish and raises a conflict instead of overwriting it", async () => {
    prisma.rasterWish.findMany.mockResolvedValue([activeWish]);

    const result = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed,
    });

    expect(result.conflicts).toBe(1);
    expect(prisma.rasterWish.update).not.toHaveBeenCalled();
    expect(prisma.rasterWish.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rasterWishConflict.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inputSetId: "input-1",
          wishId: "wish-1",
          importedRowId: "row-1",
        }),
      ],
    });
  });

  it("remembers decided imported values and does not re-raise them", async () => {
    prisma.rasterWish.findMany.mockResolvedValue([activeWish]);
    prisma.rasterWishConflict.findMany.mockResolvedValueOnce([
      {
        wishId: "wish-1",
        decision: "KEEP_EXISTING",
        importedRow: { valueFingerprint: importedFingerprint },
      },
    ]);

    const result = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed,
    });

    expect(result.noops).toBe(1);
    expect(prisma.rasterWishConflict.createMany).not.toHaveBeenCalled();
  });

  it("imports a new wish once and treats the exact next import as a no-op", async () => {
    prisma.rasterWish.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        ...activeWish,
        homeWeekday: RasterWeekday.FRIDAY,
        hall: "2",
        startTime: "20:00",
        origin: "IMPORTED",
        reviewedAt: null,
        reviewedById: null,
      },
    ]);
    prisma.rasterWish.createManyAndReturn.mockResolvedValue([
      { id: "wish-2", clubId: "club-a", teamLabel: "I" },
    ]);

    const first = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed,
    });
    const second = await importParsedWishes({
      inputSetId: "input-1",
      startedById: "user-1",
      parsed,
    });

    expect(first.added).toBe(1);
    expect(second.noops).toBe(1);
    expect(prisma.rasterWish.createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it("manual matching of an unmatched row creates a conflict when values differ", async () => {
    const importedRow = {
      id: "row-1",
      inputSetId: "input-1",
      batch: { sourceKind: "PDF" },
      clubId: "club-a",
      clubName: "Club A",
      teamLabel: "I",
      homeWeekday: RasterWeekday.FRIDAY,
      hall: "2",
      startTime: "20:00",
      spielwochePref: null,
      requestedRasterzahl: null,
      notes: null,
      valueFingerprint: "fp-1",
    };
    prisma.rasterImportedWishRow.findFirst.mockResolvedValue(importedRow);
    prisma.rasterWish.findFirst.mockResolvedValue(activeWish);
    prisma.rasterImportedWishRow.update.mockResolvedValue({
      ...importedRow,
      matchedWishId: "wish-1",
    });

    await matchImportedWishRow({
      inputSetId: "input-1",
      rowId: "row-1",
      wishId: "wish-1",
      actorId: "user-1",
    });

    expect(prisma.rasterWishConflict.create).toHaveBeenCalled();
  });

  it("derives missing wishes from the current parsed source union", async () => {
    prisma.rasterWish.findMany.mockResolvedValue([
      activeWish,
      { ...activeWish, id: "wish-b", clubId: "club-b", clubName: "Club B" },
    ]);
    const review = await listWishImportReview("input-1");

    expect(review.missingWishes.map((wish) => wish.id)).toEqual(["wish-b"]);
  });
});
