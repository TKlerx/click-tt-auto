import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { startOptimizationRun } from "@/services/raster/runs";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/services/raster/inputSets", () => ({
  syncInputSetSourceCaches: vi.fn(),
}));
vi.mock("@/services/raster/upperLeague", () => ({
  applyUpperLeagueInjectionToInputSet: vi.fn(),
}));
vi.mock("@/lib/raster/coverage", () => ({
  buildCoverageRecordForInputSet: vi.fn().mockResolvedValue({ complete: true }),
}));

// Regression: an old READY status must not permit a run after sync finds uncertain identities.
describe("source identity run readiness", () => {
  beforeEach(() => vi.resetAllMocks());
  it("refuses to enqueue a run with a pending workspace identity after cache sync", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
      seasonModelJson: JSON.stringify({
        sourceIdentityReferences: [
          { kind: "TEAM", normalizedSourceName: "herren1" },
        ],
      }),
    } as never);
    prismaMock.rasterSourceIdentityAlias.findMany.mockResolvedValue([
      { rawSourceName: "Herren 1" },
    ] as never);
    await expect(
      startOptimizationRun({
        inputSetId: "ready-workspace",
        startedById: "admin",
        settings: { strategy: "cp_sat", timeLimitSeconds: 60, weights: {} },
      }),
    ).rejects.toThrow("Source identity mappings require review");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.rasterOptimizationRun.create).not.toHaveBeenCalled();
    expect(prismaMock.backgroundJob.create).not.toHaveBeenCalled();
  });
});
