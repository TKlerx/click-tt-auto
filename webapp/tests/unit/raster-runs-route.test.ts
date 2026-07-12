import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { InputSetStatus, Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

import { POST } from "@/app/api/raster/input-sets/[id]/runs/route";

describe("raster runs route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 422 for invalid run settings", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      name: "OWL 2026",
      district: "OWL",
      createdById: "admin-1",
      createdAt: new Date("2026-07-10T00:00:00Z"),
      status: InputSetStatus.READY,
      seasonModelJson: "{}",
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/raster/input-sets/input-1/runs", {
        method: "POST",
        body: JSON.stringify({ timeLimitSeconds: 0 }),
      }),
      { params: Promise.resolve({ id: "input-1" }) },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid run settings",
    });
    expect(prismaMock.rasterOptimizationRun.create).not.toHaveBeenCalled();
  });

  it("starts a run without fixed Rasterzahlen", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-wttv",
      name: "WTTV 2026",
      district: "WTTV",
      createdById: "admin-1",
      createdAt: new Date("2026-07-10T00:00:00Z"),
      status: InputSetStatus.READY,
      seasonModelJson: "{}",
      _count: { wishes: 12, fixedRasterzahlen: 0 },
    } as never);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterOptimizationRun.create.mockResolvedValue({
      id: "run-1",
      inputSetId: "input-wttv",
    } as never);
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job-1" } as never);
    prismaMock.rasterOptimizationRun.update.mockResolvedValue({
      id: "run-1",
      jobId: "job-1",
    } as never);
    prismaMock.auditEntry.create.mockResolvedValue({ id: "audit-1" } as never);

    const response = await POST(
      new Request("http://localhost/api/raster/input-sets/input-wttv/runs", {
        method: "POST",
        body: JSON.stringify({ timeLimitSeconds: 60 }),
      }),
      { params: Promise.resolve({ id: "input-wttv" }) },
    );

    expect(response.status).toBe(202);
    expect(prismaMock.rasterOptimizationRun.create).toHaveBeenCalledWith({
      data: {
        inputSetId: "input-wttv",
        startedById: "admin-1",
        settings: JSON.stringify({ timeLimitSeconds: 60, weights: {} }),
      },
    });
    expect(prismaMock.backgroundJob.create).toHaveBeenCalledWith({
      data: {
        jobType: "raster_run",
        payload: JSON.stringify({ runId: "run-1" }),
        createdByUserId: "admin-1",
      },
    });
  });
});
