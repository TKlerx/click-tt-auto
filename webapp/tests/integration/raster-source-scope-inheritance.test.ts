import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { listRasterSourcesForScope } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster source scope inheritance", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists sources for a Bezirk and its ancestors only", async () => {
    prismaMock.scope.findUnique.mockResolvedValue({
      id: "owl",
      parent: { id: "wttv", parent: { id: "de" } },
    } as never);
    prismaMock.rasterSource.findMany.mockResolvedValue([] as never);

    await listRasterSourcesForScope("owl", "2026/27");

    expect(prismaMock.rasterSource.findMany).toHaveBeenCalledWith({
      where: {
        scopeId: { in: ["owl", "wttv", "de"] },
        season: "2026/27",
      },
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    });
  });
});
