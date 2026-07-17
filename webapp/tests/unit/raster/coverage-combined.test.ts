import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

const { reviewHallCapacitiesForInputSet } = vi.hoisted(() => ({
  reviewHallCapacitiesForInputSet: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/services/raster/capacity", () => ({
  reviewHallCapacitiesForInputSet,
}));

import { buildCoverageRecordForInputSet } from "@/lib/raster/coverage";

const bezirk = (id: string) => ({
  id,
  parent: { code: "WTTV", parent: { code: "DE" } },
});

const scopeModel = (teamId: string, excludedGroupId?: string) =>
  JSON.stringify({
    groups: excludedGroupId
      ? [{ id: excludedGroupId, planningStatus: "exclude", teamIds: [] }]
      : [],
    teams: [
      {
        id: teamId,
        wishMatchId: undefined,
        homeWeekday: undefined,
        hall: undefined,
        startTime: undefined,
      },
    ],
  });

describe("coverage for a combined input set", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // A combined input set has no sources of its own, so its own seasonModelJson
  // is always null. Reading it recorded every combined run as gap-free.
  it("reads the spanned scopes' models rather than its own empty one", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "scope-a",
      season: "2026/27",
      seasonModelJson: null,
      spannedScopes: [{ scopeId: "scope-a" }, { scopeId: "scope-b" }],
    } as never);
    prismaMock.rasterInputSet.findMany.mockResolvedValue([
      { id: "set-a", scopeId: "scope-a", seasonModelJson: scopeModel("team-a") },
      {
        id: "set-b",
        scopeId: "scope-b",
        seasonModelJson: scopeModel("team-b", "group-b"),
      },
    ] as never);
    prismaMock.scope.findMany.mockResolvedValue([
      bezirk("scope-a"),
      bezirk("scope-b"),
    ] as never);
    reviewHallCapacitiesForInputSet.mockResolvedValue({ rows: [] });

    const coverage = await buildCoverageRecordForInputSet("combined-1");

    expect(coverage.complete).toBe(false);
    expect(coverage.spannedScopes).toEqual(["scope-a", "scope-b"]);
    // The gaps are named, not merely counted (FR-032, FR-037).
    expect(coverage.wishGaps.map((gap) => gap.teamId).sort()).toEqual([
      "team-a",
      "team-b",
    ]);
    expect(coverage.excludedGroups).toEqual(["group-b"]);
  });

  // Spanning every scope with gaps is the case that used to come out complete.
  it("does not call an all-scope run with gaps complete", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "scope-a",
      season: "2026/27",
      seasonModelJson: null,
      spannedScopes: [{ scopeId: "scope-a" }, { scopeId: "scope-b" }],
    } as never);
    prismaMock.rasterInputSet.findMany.mockResolvedValue([
      { id: "set-a", scopeId: "scope-a", seasonModelJson: scopeModel("team-a") },
      { id: "set-b", scopeId: "scope-b", seasonModelJson: scopeModel("team-b") },
    ] as never);
    prismaMock.scope.findMany.mockResolvedValue([
      bezirk("scope-a"),
      bezirk("scope-b"),
    ] as never);
    reviewHallCapacitiesForInputSet.mockResolvedValue({ rows: [] });

    const coverage = await buildCoverageRecordForInputSet("combined-1");

    expect(coverage.spannedAll).toBe(true);
    expect(coverage.complete).toBe(false);
  });

  // Edge case from the spec: the run spans the scope and finds nothing there.
  it("records a spanned scope that has no input set at all", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "scope-a",
      season: "2026/27",
      seasonModelJson: null,
      spannedScopes: [{ scopeId: "scope-a" }, { scopeId: "scope-b" }],
    } as never);
    prismaMock.rasterInputSet.findMany.mockResolvedValue([
      {
        id: "set-a",
        scopeId: "scope-a",
        seasonModelJson: JSON.stringify({ groups: [], teams: [] }),
      },
    ] as never);
    prismaMock.scope.findMany.mockResolvedValue([
      bezirk("scope-a"),
      bezirk("scope-b"),
    ] as never);
    reviewHallCapacitiesForInputSet.mockResolvedValue({ rows: [] });

    const coverage = await buildCoverageRecordForInputSet("combined-1");

    expect(coverage.scopesWithoutInputSet).toEqual(["scope-b"]);
    expect(coverage.complete).toBe(false);
  });
});
