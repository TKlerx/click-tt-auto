import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  adoptLegacyRasterSources,
  listRasterSourcesForInputSet,
  upsertRasterSource,
} from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster source workspace ownership", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves sources in the selected workspace", async () => {
    prismaMock.rasterSource.upsert.mockResolvedValue({
      id: "source-1",
    } as never);

    await upsertRasterSource({
      scopeId: "owl",
      inputSetId: "input-1",
      season: "2026/27",
      sourceType: "GROUP_ASSIGNMENT",
      sourceRef: "https://example.test",
      displayName: "Groups",
    });

    expect(prismaMock.rasterSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inputSetId_sourceType_sourceRef: {
            inputSetId: "input-1",
            sourceType: "GROUP_ASSIGNMENT",
            sourceRef: "https://example.test",
          },
        },
        create: expect.objectContaining({ inputSetId: "input-1" }),
      }),
    );
  });

  it("lists sources by workspace", async () => {
    prismaMock.rasterSource.findMany.mockResolvedValue([] as never);

    await listRasterSourcesForInputSet("input-1");

    expect(prismaMock.rasterSource.findMany).toHaveBeenCalledWith({
      where: { inputSetId: "input-1" },
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    });
  });

  it("adopts legacy sources for the first selected workspace", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      scopeId: "owl",
      season: "2026/27",
    } as never);

    await adoptLegacyRasterSources("input-1");

    expect(prismaMock.rasterSource.updateMany).toHaveBeenCalledWith({
      where: {
        scopeId: "owl",
        season: "2026/27",
        inputSetId: null,
      },
      data: { inputSetId: "input-1" },
    });
  });
});
