import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  syncInputSetSourceCaches,
  updateGroupPlanningStatus,
  updateGroupRasterMode,
  validateInputSet,
} from "@/services/raster";
import { InputSetStatus } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

const model = {
  clubs: [],
  teams: [{ id: "t1" }],
  groups: [
    {
      ref: { league: "L", name: "G6" },
      size: 6,
      teamIds: ["t1"],
    },
  ],
  wishes: [],
  absoluteConstraints: [],
  warnings: [],
};

describe("raster input set service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks unconfirmed six-team groups", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      scopeId: "owl",
    } as never);
    prismaMock.scope.findUnique.mockResolvedValue(null);
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify(model),
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);

    await expect(validateInputSet("input-1")).resolves.toMatchObject({
      errors: [expect.stringContaining("Six-team group")],
    });
  });

  it("accepts reviewed six-team group modes", async () => {
    for (const rasterMode of ["single", "double"] as const) {
      prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
        id: `input-${rasterMode}`,
        scopeId: "owl",
      } as never);
      prismaMock.scope.findUnique.mockResolvedValueOnce(null);
      prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
        id: `input-${rasterMode}`,
        status: InputSetStatus.DRAFT,
        seasonModelJson: JSON.stringify({
          ...model,
          groups: [{ ...model.groups[0], rasterMode }],
        }),
        _count: { wishes: 1, fixedRasterzahlen: 0 },
      } as never);
      prismaMock.rasterInputSet.update.mockResolvedValueOnce({} as never);

      await expect(
        validateInputSet(`input-${rasterMode}`),
      ).resolves.toMatchObject({
        errors: [],
      });
    }
  });

  it("blocks groups with missing wish PDFs until reviewed", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      scopeId: "owl",
    } as never);
    prismaMock.scope.findUnique.mockResolvedValueOnce(null);
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify({
        ...model,
        teams: [{ id: "t1", capacityRelevant: false }],
        groups: [{ ...model.groups[0], rasterMode: "single" }],
      }),
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);

    await expect(validateInputSet("input-1")).resolves.toMatchObject({
      errors: [expect.stringContaining("without parsed wish PDFs")],
    });
  });

  it("accepts excluded groups with missing wish PDFs", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      scopeId: "owl",
    } as never);
    prismaMock.scope.findUnique.mockResolvedValueOnce(null);
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify({
        ...model,
        teams: [{ id: "t1", capacityRelevant: false }],
        groups: [
          {
            ...model.groups[0],
            rasterMode: "single",
            planningStatus: "exclude",
          },
        ],
      }),
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);
    prismaMock.rasterInputSet.update.mockResolvedValueOnce({} as never);

    await expect(validateInputSet("input-1")).resolves.toMatchObject({
      errors: [],
    });
  });

  it("persists reviewed six-team group mode", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify(model),
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);
    prismaMock.rasterInputSet.update.mockResolvedValue({
      id: "input-1",
    } as never);

    await updateGroupRasterMode("input-1", "L::G6", "double");

    expect(prismaMock.rasterInputSet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          seasonModelJson: expect.stringContaining('"rasterMode":"double"'),
          groupAssignmentJson: expect.stringContaining('"rasterMode":"double"'),
        }),
      }),
    );
  });

  it("updates capacity relevance when group planning status changes", async () => {
    const seasonModelJson = JSON.stringify({
      ...model,
      teams: [
        { id: "t1", capacityRelevant: true, wishMatchId: "wish-1" },
        { id: "t2", capacityRelevant: true },
      ],
      groups: [{ ...model.groups[0], teamIds: ["t1", "t2"] }],
    });
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson,
    } as never);
    prismaMock.rasterInputSet.update.mockResolvedValue({} as never);

    await updateGroupPlanningStatus("input-1", "L::G6", "exclude");

    let saved = JSON.parse(
      prismaMock.rasterInputSet.update.mock.calls[0]?.[0].data
        .seasonModelJson as string,
    );
    expect(saved.teams).toEqual([
      expect.objectContaining({ id: "t1", capacityRelevant: false }),
      expect.objectContaining({ id: "t2", capacityRelevant: false }),
    ]);

    prismaMock.rasterInputSet.update.mockClear();
    prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify({
        ...model,
        teams: [
          { id: "t1", capacityRelevant: false, wishMatchId: "wish-1" },
          { id: "t2", capacityRelevant: false },
        ],
        groups: [
          {
            ...model.groups[0],
            teamIds: ["t1", "t2"],
            planningStatus: "exclude",
          },
        ],
      }),
    } as never);

    await updateGroupPlanningStatus("input-1", "L::G6", "include");

    saved = JSON.parse(
      prismaMock.rasterInputSet.update.mock.calls[0]?.[0].data
        .seasonModelJson as string,
    );
    expect(saved.teams).toEqual([
      expect.objectContaining({ id: "t1", capacityRelevant: true }),
      expect.objectContaining({ id: "t2", capacityRelevant: false }),
    ]);
  });

  it("syncs inherited source caches into input sets", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      scopeId: "owl",
    } as never);
    prismaMock.scope.findUnique.mockResolvedValue({
      id: "owl",
      parent: { id: "wttv", parent: { id: "de" } },
    } as never);
    prismaMock.rasterSource.findMany.mockResolvedValue([
      {
        id: "group-source",
        sourceType: "GROUP_ASSIGNMENT",
        sourceRef: "uploads/group.csv",
        parsedJson: '{"assignments":[]}',
      },
      {
        id: "wish-source",
        sourceType: "WISHES_PDF",
        sourceRef: "uploads/wishes.pdf",
        parsedJson: '{"teams":[]}',
      },
    ] as never);
    prismaMock.rasterInputSet.update.mockResolvedValue({} as never);
    prismaMock.rasterWish.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "wish-1",
          clubId: "ttv-lage",
          clubName: "TTV Lage",
          teamLabel: "Erwachsene IV",
          homeWeekday: "FRIDAY",
          hall: "1",
          startTime: "20:00",
          spielwochePref: "B",
          requestedRasterzahl: null,
          confidence: "REVIEW",
        },
      ] as never);
    prismaMock.rasterWish.createManyAndReturn.mockResolvedValue([
      { id: "wish-1", clubId: "ttv-lage", teamLabel: "Erwachsene IV" },
    ] as never);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);
    prismaMock.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-1" },
    ] as never);
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([] as never);

    await syncInputSetSourceCaches("input-1");

    expect(prismaMock.rasterInputSet.update).toHaveBeenCalledWith({
      where: { id: "input-1" },
      data: {
        groupAssignmentJson: '{"assignments":[]}',
        wishesJson: expect.stringContaining("wish-source"),
      },
    });
  });

  it("does not open an import batch when the parsed wish union is unchanged", async () => {
    const wishesJson = JSON.stringify({
      sources: [
        {
          sourceId: "wish-source",
          sourceRef: "uploads/wishes.pdf",
          parsed: { teams: [] },
        },
      ],
    });
    // syncInputSetSourceCaches runs on every optimizer start; re-importing
    // there would add an unmatched row per unpaired team on each run.
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      scopeId: "owl",
      season: "2026/27",
      seasonModelJson: null,
      createdById: "user-1",
      wishesJson,
    } as never);
    prismaMock.scope.findUnique.mockResolvedValue({
      id: "owl",
      parent: { id: "wttv", parent: { id: "de" } },
    } as never);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterSource.findMany.mockResolvedValue([
      {
        id: "wish-source",
        sourceType: "WISHES_PDF",
        sourceRef: "uploads/wishes.pdf",
        parsedJson: '{"teams":[]}',
      },
    ] as never);
    prismaMock.rasterInputSet.update.mockResolvedValue({} as never);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);

    await syncInputSetSourceCaches("input-1");

    expect(prismaMock.rasterWishImportBatch.create).not.toHaveBeenCalled();
  });

  it("matches wish clubs with e.V. suffixes to click-TT club names", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      scopeId: "owl",
      season: "2026/27",
      seasonModelJson: null,
    } as never);
    prismaMock.scope.findUnique.mockResolvedValue({
      id: "owl",
      parent: { id: "wttv", parent: { id: "de" } },
    } as never);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    // The active wish this sync projects into the season model.
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wish-1",
        clubId: "ttv-lage",
        clubName: "TTV Lage",
        teamLabel: "Erwachsene IV",
        homeWeekday: "FRIDAY",
        hall: "1",
        startTime: "20:00",
        spielwochePref: "B",
        requestedRasterzahl: null,
        notes: null,
        confidence: "REVIEW",
      },
    ] as never);
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([] as never);
    prismaMock.rasterWishImportBatch.create.mockResolvedValue({
      id: "batch-1",
    } as never);
    prismaMock.rasterImportedWishRow.createManyAndReturn.mockResolvedValue([
      { id: "row-1" },
    ] as never);
    prismaMock.rasterSource.findMany.mockResolvedValue([
      {
        id: "group-source",
        sourceType: "GROUP_ASSIGNMENT",
        sourceRef: "groups",
        parsedJson: JSON.stringify({
          assignments: [1, 2, 3, 4, 5].map((rasterzahl) => ({
            league: "L",
            group: "1. Bezirksklasse Erwachsene",
            rasterzahl,
            team: rasterzahl === 4 ? "TTV Lage IV" : `Other Club ${rasterzahl}`,
            sourceUrl: "https://example.test",
          })),
        }),
      },
      {
        id: "wish-source",
        sourceType: "WISHES_PDF",
        sourceRef: "wishes",
        parsedJson: JSON.stringify({
          clubs: [{ id: "ttv-lage-e-v-42614", name: "TTV Lage e.V." }],
          teams: [
            {
              clubId: "ttv-lage-e-v-42614",
              label: "Erwachsene IV",
              homeWeekday: "friday",
              hall: "1",
              startTime: "20:00",
              spielwochePref: "B",
              rasterzahl: { kind: "assignable" },
              confidence: "review",
            },
          ],
          warnings: [],
        }),
      },
    ] as never);
    prismaMock.rasterInputSet.update.mockResolvedValue({} as never);

    await syncInputSetSourceCaches("input-1");

    const update = prismaMock.rasterInputSet.update.mock.calls.at(-1)?.[0] as {
      data: { seasonModelJson?: string };
    };
    const synced = JSON.parse(update.data.seasonModelJson ?? "{}") as {
      teams: Array<{ clubId: string; label: string; startTime?: string }>;
    };
    expect(
      synced.teams.find((team) => team.label === "Erwachsene IV"),
    ).toMatchObject({
      clubId: "ttv-lage",
      startTime: "20:00",
    });
  });
});
