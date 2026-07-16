import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  getOptimizationRun,
  startOptimizationRun,
} from "@/services/raster/runs";

const { buildCoverageRecordForInputSet } = vi.hoisted(() => ({
  buildCoverageRecordForInputSet: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/raster/coverage", () => ({
  buildCoverageRecordForInputSet,
}));

vi.mock("@/services/raster/inputSets", () => ({
  syncInputSetSourceCaches: vi.fn(),
}));

describe("optimization run coverage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes coverage at start and does not recompute it when reading later", async () => {
    buildCoverageRecordForInputSet.mockResolvedValueOnce({
      complete: false,
      spannedScopes: ["scope-a"],
      spannedAll: false,
      excludedGroups: ["g1"],
      wishGaps: [],
      capacityGaps: [],
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterOptimizationRun.create.mockResolvedValue({
      id: "run-1",
      jobId: null,
    } as never);
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job-1" } as never);
    prismaMock.rasterOptimizationRun.update.mockResolvedValue({
      id: "run-1",
      coverageComplete: false,
      coverageJson: '{"excludedGroups":["g1"]}',
    } as never);

    await startOptimizationRun({
      inputSetId: "input-1",
      startedById: "user-1",
      settings: { strategy: "cp_sat", timeLimitSeconds: 60, weights: {} },
    });

    expect(prismaMock.rasterOptimizationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coverageComplete: false,
        coverageJson: expect.stringContaining('"excludedGroups":["g1"]'),
      }),
    });

    buildCoverageRecordForInputSet.mockResolvedValueOnce({
      complete: true,
      spannedScopes: ["scope-a"],
      spannedAll: true,
      excludedGroups: [],
      wishGaps: [],
      capacityGaps: [],
    });
    prismaMock.rasterOptimizationRun.findUnique.mockResolvedValue({
      id: "run-1",
      coverageComplete: false,
      coverageJson: '{"excludedGroups":["g1"]}',
    } as never);

    await expect(getOptimizationRun("run-1")).resolves.toMatchObject({
      coverageComplete: false,
      coverageJson: '{"excludedGroups":["g1"]}',
    });
    expect(buildCoverageRecordForInputSet).toHaveBeenCalledTimes(1);
  });
});
