import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { listRasterSourcesForInputSet } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster workspace switching", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads sources for the active workspace only", async () => {
    prismaMock.rasterSource.findMany
      .mockResolvedValueOnce([{ id: "source-a" }] as never)
      .mockResolvedValueOnce([{ id: "source-b" }] as never);

    await expect(listRasterSourcesForInputSet("input-a")).resolves.toEqual([
      { id: "source-a" },
    ]);
    await expect(listRasterSourcesForInputSet("input-b")).resolves.toEqual([
      { id: "source-b" },
    ]);

    expect(prismaMock.rasterSource.findMany).toHaveBeenNthCalledWith(1, {
      where: { inputSetId: "input-a" },
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    });
    expect(prismaMock.rasterSource.findMany).toHaveBeenNthCalledWith(2, {
      where: { inputSetId: "input-b" },
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    });
  });
});
