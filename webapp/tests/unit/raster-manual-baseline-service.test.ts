import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
import {
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
