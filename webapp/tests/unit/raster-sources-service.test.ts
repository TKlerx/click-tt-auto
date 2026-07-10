import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  listRasterSourcesForDistrict,
  refreshRasterSource,
} from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/raster/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/raster/pipeline")>();
  return {
    ...actual,
    rasterIngest: {
      ...actual.rasterIngest,
      scrapeClickTtAssignments: vi.fn(),
    },
  };
});

describe("raster sources service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists district and ancestor scope sources", async () => {
    prismaMock.scope.findFirst.mockResolvedValue({
      id: "owl",
      parent: { id: "wttv", parent: { id: "de" } },
    } as never);
    prismaMock.rasterSource.findMany.mockResolvedValue([] as never);

    await listRasterSourcesForDistrict("OWL", "GROUP_ASSIGNMENT");

    expect(prismaMock.rasterSource.findMany).toHaveBeenCalledWith({
      where: {
        scopeId: { in: ["owl", "wttv", "de"] },
        sourceType: "GROUP_ASSIGNMENT",
      },
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    });
  });

  it("refreshes group assignment sources into parsed JSON", async () => {
    const uploadDir = path.join(process.cwd(), "uploads", "test");
    const sourceRef = "uploads/test/group-assignment.csv";
    await mkdir(uploadDir, { recursive: true });
    await writeFile(
      path.join(process.cwd(), sourceRef),
      [
        "league,group,division,rasterzahl,team,sourceUrl,wishUrl",
        '"Liga","Gruppe 1","Erwachsene","1","Club A","https://example.test/group",""',
      ].join("\n"),
      "utf8",
    );
    try {
      prismaMock.rasterSource.findUnique.mockResolvedValue({
        id: "source-1",
        sourceType: "GROUP_ASSIGNMENT",
        sourceRef,
        scope: { id: "wttv", code: "WTTV" },
      } as never);
      prismaMock.rasterSource.update.mockResolvedValue({
        id: "source-1",
      } as never);

      await refreshRasterSource("source-1");

      expect(prismaMock.rasterSource.update).toHaveBeenCalledWith({
        where: { id: "source-1" },
        data: {
          contentHash: expect.any(String),
          parsedJson: expect.stringContaining('"assignments"'),
        },
        include: { scope: true },
      });
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });

  it("refreshes click-TT group assignment sources on request", async () => {
    const { rasterIngest } = await import("@/lib/raster/pipeline");
    vi.mocked(rasterIngest.scrapeClickTtAssignments).mockResolvedValue([
      {
        league: "Liga",
        group: "Gruppe 1",
        division: "Erwachsene",
        rasterzahl: 1,
        team: "Club A",
        sourceUrl: "https://example.test/group",
      },
    ]);
    prismaMock.rasterSource.findUnique.mockResolvedValue({
      id: "source-clicktt",
      sourceType: "GROUP_ASSIGNMENT",
      sourceRef: "clicktt://group-assignment",
      scope: { id: "wttv", code: "WTTV" },
    } as never);
    prismaMock.rasterSource.update.mockResolvedValue({
      id: "source-clicktt",
    } as never);

    await refreshRasterSource("source-clicktt");

    expect(rasterIngest.scrapeClickTtAssignments).toHaveBeenCalledWith();
    expect(prismaMock.rasterSource.update).toHaveBeenCalledWith({
      where: { id: "source-clicktt" },
      data: {
        contentHash: expect.any(String),
        parsedJson: expect.stringContaining('"assignments"'),
      },
      include: { scope: true },
    });
  });
});
