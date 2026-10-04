import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
import {
  getSnapshotBaselineComparison,
  baselineSourceIdentity,
  countBaselineRows,
  prepareManualBaselineRows,
  projectBaselineComparison,
  importManualBaseline,
  BaselineImportConflictError,
  BaselineImportError,
  BaselineValidationError,
  reviewManualBaselineRow,
} from "@/services/raster/manualBaselines";
import type { SeasonModel } from "../../../src/raster/types";

const model: SeasonModel = {
  clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
  teams: [
    {
      id: "team-a",
      clubId: "club-a",
      label: "Club A",
      group: { league: "District", name: "Group 1" },
      homeWeekday: "monday",
      hall: "1",
      rasterzahl: { kind: "assignable" },
      confidence: "ok",
    },
  ],
  groups: [
    {
      ref: { league: "District", name: "Group 1" },
      size: 6,
      teamIds: ["team-a"],
    },
  ],
  wishes: [],
  absoluteConstraints: [],
  warnings: [],
};

describe("manual baseline service", () => {
  afterEach(() => vi.clearAllMocks());
  it("matches exact rows and rejects rows outside the season model", () => {
    const result = prepareManualBaselineRows(
      [
        {
          group: "Group 1",
          team: "Club A",
          rasterzahl: 3,
          sourceUrl: "https://example.test/group-1",
        },
        {
          group: "Other Group",
          team: "Club X",
          rasterzahl: 1,
          sourceUrl: "https://example.test/other",
        },
      ],
      model,
    );
    expect(result.rejectedCount).toBe(1);
    expect(result.rows).toMatchObject([
      { status: "MATCHED", targetTeamId: "team-a", rasterzahl: 3 },
    ]);
  });

  it("rejects concurrent imports through the database uniqueness guard", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      season: "2026/27",
      seasonModelJson: JSON.stringify(model),
      scope: { code: "OWL" },
    } as never);
    prismaMock.rasterManualBaseline.create.mockRejectedValue({ code: "P2002" });
    await expect(
      importManualBaseline({
        inputSetId: "input-1",
        startedById: "user-1",
        scrape: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(BaselineImportConflictError);
  });

  it("activates a complete import atomically", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      season: "2026/27",
      seasonModelJson: JSON.stringify(model),
      scope: { code: "OWL" },
    } as never);
    prismaMock.rasterManualBaseline.create.mockResolvedValue({
      id: "baseline-2",
    } as never);
    prismaMock.rasterManualBaseline.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterManualBaseline.findMany.mockResolvedValue([
      {
        id: "baseline-2",
        active: true,
        status: "READY",
        rows: [{ status: "MATCHED" }],
      },
    ] as never);

    const result = await importManualBaseline({
      inputSetId: "input-1",
      startedById: "user-1",
      scrape: async () => [
        {
          league: "Group 1",
          group: "Repeated",
          team: "Club A",
          rasterzahl: 2,
          sourceUrl: "source",
        },
      ],
    });

    expect(
      prismaMock.rasterManualBaselineRow.createMany,
    ).toHaveBeenCalledOnce();
    expect(prismaMock.rasterManualBaseline.updateMany).toHaveBeenCalledWith({
      where: { inputSetId: "input-1", active: true },
      data: { active: false },
    });
    expect(prismaMock.rasterManualBaseline.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "baseline-2" },
        data: expect.objectContaining({ active: true, status: "READY" }),
      }),
    );
    expect(result.active?.id).toBe("baseline-2");
  });

  it("marks only the new attempt failed when crawling fails", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      season: "2026/27",
      seasonModelJson: JSON.stringify(model),
      scope: { code: "OWL" },
    } as never);
    prismaMock.rasterManualBaseline.create.mockResolvedValue({
      id: "baseline-2",
    } as never);
    prismaMock.rasterManualBaseline.findFirst.mockResolvedValue({
      id: "baseline-1",
      rows: [],
    } as never);

    await expect(
      importManualBaseline({
        inputSetId: "input-1",
        startedById: "user-1",
        scrape: async () => {
          throw new Error("secret page dump");
        },
      }),
    ).rejects.toBeInstanceOf(BaselineImportError);

    expect(prismaMock.rasterManualBaseline.update).toHaveBeenCalledWith({
      where: { id: "baseline-2" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(prismaMock.rasterManualBaseline.updateMany).not.toHaveBeenCalled();
    expect(
      JSON.stringify(prismaMock.rasterManualBaseline.update.mock.calls),
    ).not.toContain("secret page dump");
  });

  it.each([
    ["ignore", "IGNORED"],
    ["accept-unresolved", "ACCEPTED_UNRESOLVED"],
  ] as const)(
    "applies %s decisions and recalculates readiness",
    async (decision, rowStatus) => {
      prismaMock.rasterManualBaselineRow.findFirst.mockResolvedValue({
        id: "row-1",
        baselineId: "baseline-1",
        baseline: { inputSet: { seasonModelJson: JSON.stringify(model) } },
      } as never);
      prismaMock.$transaction.mockImplementation(async (callback) =>
        callback(prismaMock),
      );
      prismaMock.rasterManualBaselineRow.update.mockResolvedValue({
        id: "row-1",
        status: rowStatus,
      } as never);
      prismaMock.rasterManualBaselineRow.findMany.mockResolvedValue([
        { status: rowStatus },
      ] as never);

      const result = await reviewManualBaselineRow({
        inputSetId: "input-1",
        rowId: "row-1",
        reviewedById: "user-1",
        decision: { decision },
      });

      expect(result.status).toBe("READY");
      expect(prismaMock.rasterManualBaselineRow.update).toHaveBeenCalledWith({
        where: { id: "row-1" },
        data: expect.objectContaining({
          status: rowStatus,
          reviewedById: "user-1",
        }),
      });
    },
  );

  it("rejects rows outside the active workspace without writing", async () => {
    prismaMock.rasterManualBaselineRow.findFirst.mockResolvedValue(null);
    await expect(
      reviewManualBaselineRow({
        inputSetId: "input-1",
        rowId: "foreign-row",
        reviewedById: "reviewer",
        decision: { decision: "ignore" },
      }),
    ).rejects.toBeInstanceOf(BaselineValidationError);
    expect(prismaMock.rasterManualBaselineRow.findFirst).toHaveBeenCalledWith({
      where: {
        id: "foreign-row",
        baseline: { inputSetId: "input-1", active: true },
      },
      include: { baseline: { include: { inputSet: true } } },
    });
    expect(prismaMock.rasterManualBaselineRow.update).not.toHaveBeenCalled();
  });

  it("does not let mapping turn an invalid Rasterzahl into a ready mapped assignment", async () => {
    prismaMock.rasterManualBaselineRow.findFirst.mockResolvedValue({
      id: "row-invalid",
      baselineId: "baseline-1",
      rasterzahl: 7,
      baseline: { inputSet: { seasonModelJson: JSON.stringify(model) } },
    } as never);
    await expect(
      reviewManualBaselineRow({
        inputSetId: "input-1",
        rowId: "row-invalid",
        reviewedById: "reviewer",
        decision: { decision: "map", targetTeamId: "team-a" },
      }),
    ).rejects.toBeInstanceOf(BaselineValidationError);
    expect(prismaMock.rasterManualBaselineRow.update).not.toHaveBeenCalled();
  });

  it("rejects a stale mapping target outside the current season model", async () => {
    prismaMock.rasterManualBaselineRow.findFirst.mockResolvedValue({
      id: "row-1",
      baselineId: "baseline-1",
      baseline: { inputSet: { seasonModelJson: JSON.stringify(model) } },
    } as never);
    await expect(
      reviewManualBaselineRow({
        inputSetId: "input-1",
        rowId: "row-1",
        reviewedById: "user-1",
        decision: { decision: "map", targetTeamId: "removed-team" },
      }),
    ).rejects.toBeInstanceOf(BaselineValidationError);
  });

  it("matches the scraper page title to the model league while retaining its navigation group", () => {
    const liveModel = {
      ...model,
      teams: [
        {
          ...model.teams[0]!,
          group: { league: "Verified Group 1", name: "Navigation label" },
        },
      ],
      groups: [
        {
          ...model.groups[0]!,
          ref: { league: "Verified Group 1", name: "Navigation label" },
        },
      ],
    };
    const result = prepareManualBaselineRows(
      [
        {
          league: "Verified Group 1",
          group: "Navigation label",
          team: "Club A",
          rasterzahl: 3,
          sourceUrl: "source",
        },
      ],
      liveModel,
    );
    expect(result.rejectedCount).toBe(0);
    expect(result.rows[0]).toMatchObject({
      sourceGroupLabel: "Verified Group 1",
      status: "MATCHED",
      targetTeamId: "team-a",
    });
  });

  it("uses the verified page title to disambiguate duplicate navigation labels", () => {
    const result = prepareManualBaselineRows(
      [
        {
          league: "Group 1",
          group: "Repeated label",
          team: "Club A",
          rasterzahl: 2,
          sourceUrl: "verified",
        },
      ],
      model,
    );
    expect(result.rows[0]).toMatchObject({
      sourceGroupLabel: "Group 1",
      status: "MATCHED",
      targetTeamId: "team-a",
    });
  });
});

describe("manual baseline classification and comparison regressions", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([0, 4, 4.5, 13, Number.NaN])(
    "rejects unsupported rulebook group size %s instead of inventing a range",
    (size) => {
      const result = prepareManualBaselineRows(
        [
          {
            group: "Group 1",
            team: "Club A",
            rasterzahl: 1,
            sourceUrl: "source",
          },
        ],
        { ...model, groups: [{ ...model.groups[0]!, size }] },
      );
      expect(result.rows[0]?.status).toBe("INVALID");
    },
  );

  it.each([
    [5, 6],
    [6, 6],
    [7, 8],
    [8, 8],
    [9, 10],
    [10, 10],
    [11, 12],
    [12, 12],
  ])(
    "uses the numeric rulebook range for size %s in both modes",
    (size, max) => {
      for (const rasterMode of ["single", "double"] as const) {
        const result = prepareManualBaselineRows(
          [
            {
              group: "Group 1",
              team: "Club A",
              rasterzahl: max!,
              sourceUrl: "source",
            },
          ],
          {
            ...model,
            groups: [{ ...model.groups[0]!, size: size!, rasterMode }],
          },
        );
        expect(result.rows[0]?.status).toBe("MATCHED");
        expect(
          prepareManualBaselineRows(
            [
              {
                group: "Group 1",
                team: "Club A",
                rasterzahl: max! + 1,
                sourceUrl: "source",
              },
            ],
            {
              ...model,
              groups: [{ ...model.groups[0]!, size: size!, rasterMode }],
            },
          ).rows[0]?.status,
        ).toBe("INVALID");
      }
    },
  );

  it("routes duplicates and invalid ranges to review", () => {
    const result = prepareManualBaselineRows(
      [
        { group: "Group 1", team: "Club A", rasterzahl: 3, sourceUrl: "one" },
        { group: "Group 1", team: "Club A", rasterzahl: 7, sourceUrl: "two" },
      ],
      model,
    );
    expect(result.rows.map((row) => row.status)).toEqual(["REVIEW", "INVALID"]);
    expect(new Set(result.rows.map((row) => row.sourceIdentityKey)).size).toBe(
      2,
    );
  });

  it.each(["IGNORED", "ACCEPTED_UNRESOLVED"])(
    "preserves %s decisions for invalid source rows across refresh",
    (status) => {
      const result = prepareManualBaselineRows(
        [{ group: "Group 1", team: "Club A", rasterzahl: 7, sourceUrl: "new" }],
        model,
        [
          {
            sourceIdentityKey: baselineSourceIdentity("Group 1", "Club A"),
            status,
            targetTeamId: null,
            targetTeamLabel: null,
            reviewedById: "reviewer",
            reviewedAt: new Date(0),
          },
        ],
      );
      expect(result.rows[0]).toMatchObject({
        status,
        targetTeamId: null,
        reviewedById: "reviewer",
      });
    },
  );

  it.each(["IGNORED", "ACCEPTED_UNRESOLVED"])(
    "does not restore an automatic target for a reviewed %s row",
    (status) => {
      const result = prepareManualBaselineRows(
        [{ group: "Group 1", team: "Club A", rasterzahl: 3, sourceUrl: "new" }],
        model,
        [
          {
            sourceIdentityKey: baselineSourceIdentity("Group 1", "Club A"),
            status,
            targetTeamId: null,
            targetTeamLabel: null,
            reviewedById: "reviewer",
            reviewedAt: new Date(0),
          },
        ],
      );
      expect(result.rows[0]).toMatchObject({
        status,
        targetTeamId: null,
        targetTeamLabel: null,
      });
    },
  );

  it("reopens review when the previously mapped team has left the source group", () => {
    const renamed = {
      ...model.teams[0]!,
      name: "New label",
      label: "New label",
      group: { league: "District", name: "Other group" },
    };
    const result = prepareManualBaselineRows(
      [
        {
          group: "Group 1",
          team: "Old label",
          rasterzahl: 3,
          sourceUrl: "new",
        },
      ],
      {
        ...model,
        teams: [renamed],
        groups: [{ ...model.groups[0]!, teamIds: [] }],
      },
      [
        {
          sourceIdentityKey: baselineSourceIdentity("Group 1", "Old label"),
          status: "MATCHED",
          targetTeamId: "team-a",
          targetTeamLabel: "Old label",
          reviewedById: "reviewer",
          reviewedAt: new Date(0),
        },
      ],
    );
    expect(result.rows[0]).toMatchObject({
      status: "REVIEW",
      targetTeamId: null,
    });
  });

  it("carries a compatible reviewed mapping across Rasterzahl changes", () => {
    const key = baselineSourceIdentity("Group 1", "Club A");
    const result = prepareManualBaselineRows(
      [{ group: "Group 1", team: "Club A", rasterzahl: 4, sourceUrl: "new" }],
      model,
      [
        {
          sourceIdentityKey: key,
          status: "MATCHED",
          targetTeamId: "team-a",
          targetTeamLabel: "Club A",
          reviewedById: "user-1",
          reviewedAt: new Date(0),
        },
      ],
    );
    expect(result.rows[0]).toMatchObject({
      status: "MATCHED",
      targetTeamId: "team-a",
      reviewedById: "user-1",
      rasterzahl: 4,
    });
  });

  it("counts review state and projects every comparison state", () => {
    expect(
      countBaselineRows([{ status: "MATCHED" }, { status: "INVALID" }]),
    ).toMatchObject({ total: 2, matched: 1, invalid: 1 });
    const result = projectBaselineComparison(
      [
        {
          targetTeamId: "a",
          targetTeamLabel: "A",
          rasterzahl: 1,
          status: "MATCHED",
        },
        {
          targetTeamId: "b",
          targetTeamLabel: "B",
          rasterzahl: 2,
          status: "MATCHED",
        },
        {
          targetTeamId: "c",
          targetTeamLabel: "C",
          rasterzahl: 3,
          status: "MATCHED",
        },
      ],
      [
        { team: "A", rasterzahl: 1 },
        { team: "B", rasterzahl: 4 },
        { team: "D", rasterzahl: 5 },
      ],
      new Map([
        ["A", "a"],
        ["B", "b"],
        ["D", "d"],
      ]),
    );
    expect(result.counts).toEqual({
      unchanged: 1,
      changed: 1,
      new: 1,
      missing: 1,
    });
  });

  it("omits comparison for a run without a baseline even if its model is invalid", async () => {
    prismaMock.rasterSnapshot.findUnique.mockResolvedValue({
      assignments: [],
      run: { baseline: null, inputSet: { seasonModelJson: "invalid" } },
    } as never);
    await expect(
      getSnapshotBaselineComparison("without-baseline"),
    ).resolves.toBeNull();
  });

  it("resolves snapshot teams by both league and group, retaining all unresolved outputs", async () => {
    const otherTeam = {
      ...model.teams[0]!,
      id: "team-b",
      group: { league: "District", name: "Group 2" },
    };
    const snapshotModel = { ...model, teams: [...model.teams, otherTeam] };
    prismaMock.rasterSnapshot.findUnique.mockResolvedValue({
      assignments: [
        {
          id: "a",
          team: "Club A",
          league: "District",
          group: "Group 1",
          rasterzahl: 3,
        },
        {
          id: "b",
          team: "Club A",
          league: "District",
          group: "Group 2",
          rasterzahl: 4,
        },
        {
          id: "c",
          team: "Unknown",
          league: "District",
          group: "Group 1",
          rasterzahl: 1,
        },
        {
          id: "d",
          team: "Unknown",
          league: "District",
          group: "Group 2",
          rasterzahl: 2,
        },
        {
          id: "e",
          team: "Unknown",
          league: "District",
          group: "Group 2",
          rasterzahl: 5,
        },
        {
          id: "f",
          team: "Club A",
          league: "Other league",
          group: "Group 1",
          rasterzahl: 3,
        },
      ],
      run: {
        baseline: {
          id: "original-version",
          rows: [
            {
              targetTeamId: "team-a",
              targetTeamLabel: "Club A",
              status: "MATCHED",
              rasterzahl: 3,
            },
            {
              targetTeamId: "team-b",
              targetTeamLabel: "Club A",
              status: "MATCHED",
              rasterzahl: 2,
            },
          ],
        },
        inputSet: { seasonModelJson: JSON.stringify(snapshotModel) },
      },
    } as never);
    const result = await getSnapshotBaselineComparison("snapshot-1");
    expect(result?.baselineId).toBe("original-version");
    expect(result?.counts).toEqual({
      unchanged: 1,
      changed: 1,
      new: 4,
      missing: 0,
    });
    expect(result?.rows).toHaveLength(6);
    expect(new Set(result?.rows.map((row) => row.teamId)).size).toBe(6);
  });

  it("uses resolved team ids when the same display name exists in multiple groups", () => {
    const result = projectBaselineComparison(
      [
        {
          targetTeamId: "group-b-team",
          targetTeamLabel: "Club A",
          rasterzahl: 2,
          status: "MATCHED",
        },
      ],
      [
        {
          teamId: "group-b-team",
          team: "Club A",
          league: "League",
          group: "Group B",
          rasterzahl: 2,
        },
      ],
    );
    expect(result.counts).toEqual({
      unchanged: 1,
      changed: 0,
      new: 0,
      missing: 0,
    });
  });
});
