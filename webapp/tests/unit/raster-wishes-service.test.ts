import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { replaceParsedWishes } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster wishes service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates parsed wish team rows before storing them", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );

    await replaceParsedWishes("input-1", {
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
    });

    expect(prismaMock.rasterWish.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ teamLabel: "Erwachsene II" })],
    });
  });
});
