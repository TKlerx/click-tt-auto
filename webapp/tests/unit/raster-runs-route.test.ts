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
});
