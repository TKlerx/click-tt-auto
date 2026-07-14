import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { scenarioFixture } from "./fixtures/raster-scenarios";
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

import { GET } from "@/app/api/raster/scenarios/route";
import { POST } from "@/app/api/raster/scenarios/compare/route";

describe("raster scenarios route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists scenarios for a district and input set", async () => {
    mockUser();
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({ id: "run-1" }),
    ] as never);

    const response = await GET(
      new Request(
        "http://localhost/api/raster/scenarios?district=OWL&season=2026/27&inputSetId=input-1",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scenarios: [{ id: "run-1", district: "OWL", season: "2026/27" }],
    });
  });

  it("compares compatible scenarios and returns baseline deltas", async () => {
    mockUser();
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({ id: "run-1", objectiveValue: 10 }),
      runFixture({ id: "run-2", objectiveValue: 13 }),
    ] as never);

    const response = await POST(
      new Request("http://localhost/api/raster/scenarios/compare", {
        method: "POST",
        body: JSON.stringify({
          scenarioIds: ["run-1", "run-2"],
          baselineScenarioId: "run-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      baselineScenarioId: "run-1",
      deltas: { "run-2": { objective: 3 } },
    });
  });

  it("rejects incompatible scenario comparison", async () => {
    mockUser();
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({ id: "run-1", inputSetId: "input-1" }),
      runFixture({ id: "run-2", inputSetId: "input-2" }),
    ] as never);

    const response = await POST(
      new Request("http://localhost/api/raster/scenarios/compare", {
        method: "POST",
        body: JSON.stringify({ scenarioIds: ["run-1", "run-2"] }),
      }),
    );

    expect(response.status).toBe(422);
  });
});

function mockUser() {
  requireApiUser.mockResolvedValue({
    user: {
      id: "admin-1",
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
}

function runFixture(overrides = {}) {
  const scenario = scenarioFixture();
  return {
    id: scenario.id,
    inputSetId: scenario.inputSetId,
    status: "SUCCEEDED",
    outcome: "PROVEN_OPTIMAL",
    objectiveValue: scenario.kpiSummary?.objective ?? 0,
    objectiveBreakdown: null,
    solverStatus: "OPTIMAL",
    settings: JSON.stringify({
      strategy: scenario.strategy,
      name: scenario.name,
    }),
    createdAt: new Date(scenario.createdAt),
    finishedAt: new Date(scenario.finishedAt!),
    inputSet: { district: scenario.district, season: scenario.season },
    snapshot: {
      id: `snapshot-${scenario.id}`,
      stale: scenario.stale,
      totalExcess: scenario.kpiSummary?.totalHallExcess ?? 0,
      maxExcess: scenario.kpiSummary?.maxHallExcess ?? 0,
      affectedClubs: scenario.kpiSummary?.affectedClubs ?? 0,
      objectiveBreakdown: JSON.stringify({
        wechsel: scenario.kpiSummary?.wishMisses ?? 0,
        sameClubDerbySt4: scenario.kpiSummary?.sameClubDerbyIssues ?? 0,
      }),
    },
    ...overrides,
  };
}
