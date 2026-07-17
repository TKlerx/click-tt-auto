import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn((callback) => callback(prisma)),
  rasterWishConflict: { findMany: vi.fn() },
  rasterOptimizationRun: { create: vi.fn(), update: vi.fn() },
  backgroundJob: { create: vi.fn() },
}));
const { buildCoverageRecordForInputSet } = vi.hoisted(() => ({
  buildCoverageRecordForInputSet: vi.fn().mockResolvedValue({
    complete: true,
    spannedScopes: ["scope-owl"],
    spannedAll: true,
    excludedGroups: [],
    wishGaps: [],
    capacityGaps: [],
  }),
}));

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/services/raster/inputSets", () => ({
  syncInputSetSourceCaches: vi.fn(),
}));
vi.mock("@/lib/raster/coverage", () => ({
  buildCoverageRecordForInputSet,
}));

import { startOptimizationRun } from "@/services/raster/runs";

describe("raster wish conflicts do not block runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rasterWishConflict.findMany.mockResolvedValue([
      { id: "conflict-1", wishId: "wish-1", importedRowId: "row-1" },
    ]);
    prisma.rasterOptimizationRun.create.mockResolvedValue({ id: "run-1" });
    prisma.backgroundJob.create.mockResolvedValue({ id: "job-1" });
    prisma.rasterOptimizationRun.update.mockResolvedValue({
      id: "run-1",
      jobId: "job-1",
      coverageJson: JSON.stringify({ unresolvedWishConflicts: { count: 1 } }),
    });
  });

  it("starts and freezes unresolved conflict counts", async () => {
    const run = await startOptimizationRun({
      inputSetId: "input-1",
      startedById: "user-1",
      settings: { strategy: "cp_sat", timeLimitSeconds: 60, weights: {} },
    });

    expect(run.id).toBe("run-1");
    expect(prisma.rasterOptimizationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coverageComplete: false,
        coverageJson: JSON.stringify({
          complete: false,
          spannedScopes: ["scope-owl"],
          spannedAll: true,
          excludedGroups: [],
          wishGaps: [],
          capacityGaps: [],
          unresolvedWishConflicts: {
            count: 1,
            conflicts: [
              { id: "conflict-1", wishId: "wish-1", importedRowId: "row-1" },
            ],
          },
        }),
      }),
    });
  });
});
