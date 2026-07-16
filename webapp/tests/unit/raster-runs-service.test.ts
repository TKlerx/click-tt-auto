import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { startOptimizationRun } from "@/services/raster/runs";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster runs service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes input-set source projection before queueing a run", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      scopeId: "scope-owl",
      season: "2026/27",
      seasonModelJson: "{}",
    } as never);
    prismaMock.scope.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterWishConflict.findMany.mockResolvedValue([]);
    prismaMock.rasterOptimizationRun.create.mockResolvedValue({
      id: "run-1",
      inputSetId: "input-1",
    } as never);
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job-1" } as never);
    prismaMock.rasterOptimizationRun.update.mockResolvedValue({
      id: "run-1",
      jobId: "job-1",
    } as never);

    await startOptimizationRun({
      inputSetId: "input-1",
      startedById: "user-1",
      settings: { strategy: "cp_sat", timeLimitSeconds: 60, weights: {} },
    });

    expect(prismaMock.rasterInputSet.findUnique).toHaveBeenCalledWith({
      where: { id: "input-1" },
      select: {
        id: true,
        scopeId: true,
        season: true,
        seasonModelJson: true,
        createdById: true,
      },
    });
    expect(
      prismaMock.rasterInputSet.findUnique.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prismaMock.rasterOptimizationRun.create.mock.invocationCallOrder[0],
    );
  });
});
