import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { syncInputSetSourceCaches } from "@/services/raster/inputSets";
const mocks = vi.hoisted(() => ({
  sources: vi.fn(),
  build: vi.fn(),
  import: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/services/raster/sources", () => ({
  listRasterSourcesForInputSet: mocks.sources,
}));
vi.mock("@/lib/raster/pipeline", () => ({
  rasterIngest: { buildSeasonModelFromAssignments: mocks.build },
}));
vi.mock("@/services/raster/wishes", () => ({
  importParsedWishes: mocks.import,
}));
const model = {
  clubs: [
    { id: "a", name: "SC Alpha" },
    { id: "b", name: "SC Beta" },
  ],
  teams: [
    { id: "ta", clubId: "a", label: "Herren I" },
    { id: "tb", clubId: "b", label: "Herren I" },
  ],
  groups: [],
  wishes: [],
  warnings: [],
};
describe("source team alias cache sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "workspace",
      scopeId: "owl",
      season: "2026/27",
      createdById: "admin",
      wishesJson: null,
    } as never);
    mocks.build.mockImplementation(async () => structuredClone(model));
    mocks.sources.mockResolvedValue([
      {
        sourceType: "GROUP_ASSIGNMENT",
        parsedJson: JSON.stringify({
          assignments: Array.from({ length: 5 }, () => ({ group: "G" })),
        }),
      },
    ]);
  });
  it("reuses a confirmed team alias during cache sync and records workspace references", async () => {
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wa",
        clubId: "a",
        clubName: "SC Alpha",
        teamLabel: "Herren 1",
        homeWeekday: "FR",
        confidence: "OK",
      },
    ] as never);
    prismaMock.rasterSourceIdentityAlias.findUnique.mockResolvedValue({
      reviewState: "CONFIRMED",
      matchConfidence: "MANUAL",
      canonicalIdentity: "ta",
    } as never);
    await syncInputSetSourceCaches("workspace");
    const saved = JSON.parse(
      prismaMock.rasterInputSet.update.mock.calls[0][0].data
        .seasonModelJson as string,
    );
    expect(saved.teams[0]).toMatchObject({
      id: "ta",
      wishMatchId: "wa",
      homeWeekday: "fr",
    });
    expect(saved.teams[1].wishMatchId).toBeUndefined();
    expect(saved.sourceIdentityReferences).toContainEqual({
      kind: "TEAM",
      normalizedSourceName: "scalphaherren1",
    });
    expect(
      prismaMock.rasterSourceIdentityAlias.findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scopeId_season_kind_normalizedSourceName: {
            scopeId: "owl",
            season: "2026/27",
            kind: "TEAM",
            normalizedSourceName: "scalphaherren1",
          },
        },
      }),
    );
  });
  it("keeps a fuzzy team identity pending without applying wish details", async () => {
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wa",
        clubId: "a",
        clubName: "SC Alpha",
        teamLabel: "Herren",
        homeWeekday: "FR",
      },
    ] as never);
    await syncInputSetSourceCaches("workspace");
    const saved = JSON.parse(
      prismaMock.rasterInputSet.update.mock.calls[0][0].data
        .seasonModelJson as string,
    );
    expect(
      saved.teams.every((team: { wishMatchId?: string }) => !team.wishMatchId),
    ).toBe(true);
    expect(prismaMock.rasterSourceIdentityAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: "TEAM",
          reviewState: "PENDING",
        }),
      }),
    );
  });
});
