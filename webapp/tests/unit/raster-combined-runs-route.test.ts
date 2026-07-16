import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser, startOptimizationRun } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  startOptimizationRun: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/lib/raster/access", () => ({
  canUseRasterLevel: () => true,
}));

vi.mock("@/services/raster", () => ({
  startOptimizationRun,
}));

import { POST } from "@/app/api/raster/combined/[id]/runs/route";

describe("raster combined runs route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts a combined run without requiring READY status", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      status: "DRAFT",
      spannedScopes: [{ scopeId: "a" }, { scopeId: "b" }],
    } as never);
    startOptimizationRun.mockResolvedValue({ id: "run-1" });

    const response = await POST(
      new Request("http://localhost/api/raster/combined/input-1/runs", {
        method: "POST",
        body: JSON.stringify({ timeLimitSeconds: 60 }),
      }),
      { params: Promise.resolve({ id: "input-1" }) },
    );

    expect(response.status).toBe(202);
    expect(startOptimizationRun).toHaveBeenCalledWith({
      inputSetId: "input-1",
      startedById: "admin-1",
      settings: { strategy: "cp_sat", timeLimitSeconds: 60, weights: {} },
    });
  });
});
