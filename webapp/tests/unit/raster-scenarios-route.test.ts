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

  it("lists scenarios for a scope and input set", async () => {
    mockUser();
    prismaMock.scope.findFirst.mockResolvedValue(scopeFixture() as never);
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({ id: "run-1" }),
    ] as never);

    const response = await GET(
      new Request(
        "http://localhost/api/raster/scenarios?scope=OWL&season=2026/27&inputSetId=input-1",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scenarios: [{ id: "run-1", scope: "OWL", season: "2026/27" }],
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

  // Every scenario's district is authorized, not just the first one's, and the
  // check runs before the comparison. Comparable scenarios do share a district,
  // so checking the first happened to cover them all -- but that relied on
  // isComparableScenario, a compatibility rule, to enforce an access rule.
  // Here the districts differ and the user holds only the first: the access
  // check must reject before the incompatibility is ever evaluated. Checking
  // scenarios[0] alone, or comparing first, returns 422 instead of 403 and
  // tells an unauthorized caller that both ids exist.
  it("refuses a scenario whose district the caller cannot access, before comparing", async () => {
    mockScopedUser();
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({ id: "run-1", inputSet: { district: "OWL", season: "2026/27" } }),
      runFixture({
        id: "run-2",
        inputSet: { district: "WESTFALEN_MITTE", season: "2026/27" },
      }),
    ] as never);
    // Authorized for OWL, not for WESTFALEN_MITTE. mockReset because
    // vi.clearAllMocks() clears recorded calls but not queued *Once values, so
    // an unconsumed one would leak into the next test.
    prismaMock.scope.findFirst.mockReset();
    prismaMock.scope.findFirst.mockImplementation((async (args: {
      where: { AND: [{ OR: [{ code: string }] }] };
    }) =>
      args.where.AND[0].OR[0].code === "OWL"
        ? { id: "scope-owl" }
        : null) as never);

    const response = await POST(
      new Request("http://localhost/api/raster/scenarios/compare", {
        method: "POST",
        body: JSON.stringify({ scenarioIds: ["run-1", "run-2"] }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("compares when the caller can access every scenario's district", async () => {
    mockScopedUser();
    prismaMock.rasterOptimizationRun.findMany.mockResolvedValue([
      runFixture({ id: "run-1", objectiveValue: 10 }),
      runFixture({ id: "run-2", objectiveValue: 13 }),
    ] as never);
    prismaMock.scope.findFirst.mockReset();
    prismaMock.scope.findFirst.mockResolvedValue({ id: "scope-owl" } as never);

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
  });
});

function mockScopedUser() {
  requireApiUser.mockResolvedValue({
    user: {
      id: "scoped-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    },
  });
}

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
    inputSet: { scope: { code: scenario.scope }, season: scenario.season },
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

function scopeFixture() {
  return {
    id: "scope-owl",
    code: "OWL",
    name: "OWL",
    parent: {
      code: "WTTV",
      name: "WTTV",
      parent: { code: "DE", name: "Germany" },
    },
  };
}
