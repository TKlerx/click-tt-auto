import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

import { GET } from "@/app/api/raster/scenarios/[id]/route";

describe("raster scenario details route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns scenario details with assignments and conflicts", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterOptimizationRun.findUnique
      .mockResolvedValueOnce(runFixture() as never)
      .mockResolvedValueOnce({
        id: "run-1",
        snapshot: { id: "snapshot-1" },
      } as never);
    prismaMock.rasterAssignment.findMany.mockResolvedValue([
      { id: "assignment-1" },
    ] as never);
    prismaMock.rasterConflict.findMany.mockResolvedValue([
      { id: "conflict-1" },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/raster/scenarios/run-1"),
      { params: Promise.resolve({ id: "run-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scenario: { id: "run-1", scope: "OWL" },
      assignments: [{ id: "assignment-1" }],
      conflicts: [{ id: "conflict-1" }],
    });
  });
});

function runFixture() {
  return {
    id: "run-1",
    inputSetId: "input-1",
    status: "SUCCEEDED",
    outcome: "PROVEN_OPTIMAL",
    objectiveValue: 0,
    objectiveBreakdown: null,
    solverStatus: "OPTIMAL",
    settings: JSON.stringify({ strategy: "cp_sat", name: "CP-SAT" }),
    createdAt: new Date("2026-07-12T10:00:00.000Z"),
    finishedAt: new Date("2026-07-12T10:06:00.000Z"),
    inputSet: { scope: { code: "OWL" }, season: "2026/27" },
    snapshot: {
      id: "snapshot-1",
      stale: false,
      totalExcess: 0,
      maxExcess: 0,
      affectedClubs: 0,
      objectiveBreakdown: "{}",
    },
  };
}
