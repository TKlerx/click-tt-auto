import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { replaceJsonWishes } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster wishes service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("caches uploaded wishes before replacing normalized rows", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );

    await expect(
      replaceJsonWishes("input-1", [
        {
          clubId: "club-a",
          clubName: "Club A",
          homeWeekday: "FRIDAY",
        },
      ]),
    ).resolves.toEqual({ count: 1 });

    expect(prismaMock.rasterInputSet.update).toHaveBeenCalledWith({
      where: { id: "input-1" },
      data: {
        wishesJson: JSON.stringify({
          wishes: [
            {
              clubId: "club-a",
              clubName: "Club A",
              homeWeekday: "FRIDAY",
            },
          ],
        }),
      },
    });
    expect(prismaMock.rasterWish.deleteMany).toHaveBeenCalledWith({
      where: { inputSetId: "input-1" },
    });
    expect(prismaMock.rasterWish.createMany).toHaveBeenCalledOnce();
  });
});
