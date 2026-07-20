import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { refreshRasterSource } from "@/services/raster";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/raster/pipeline", () => ({
  rasterIngest: {
    scrapeClickTtPublicLeagueAssignments: vi.fn().mockResolvedValue([
      {
        league: "L",
        group: "G",
        team: "Team",
        rasterzahl: 1,
        sourceUrl: "https://example.test",
      },
    ]),
  },
}));

describe("raster source parse states", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves parsed content on refresh", async () => {
    prismaMock.rasterSource.findUnique.mockResolvedValue({
      id: "source-1",
      sourceType: "GROUP_ASSIGNMENT",
      sourceRef:
        "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/leaguePage",
      scope: { code: "OWL" },
    } as never);
    prismaMock.rasterSource.update.mockResolvedValue({
      id: "source-1",
    } as never);

    await refreshRasterSource("source-1");

    expect(prismaMock.rasterSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "source-1" },
        data: expect.objectContaining({
          parsedJson: expect.stringContaining("assignments"),
        }),
      }),
    );
  });
});
