import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser, startOptimizationRun } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  startOptimizationRun: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/route-auth", () => ({ requireApiUser }));
vi.mock("@/lib/raster/access", () => ({
  canUseRasterLevel: () => true,
  assertRasterAccess: vi.fn().mockResolvedValue(true),
  listAccessibleRasterScopes: vi
    .fn()
    .mockResolvedValue([{ id: "scope-a" }, { id: "scope-b" }]),
}));

vi.mock("@/lib/raster/audit", () => ({
  logRasterAudit: vi.fn(),
}));
vi.mock("@/services/raster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/raster")>()),
  startOptimizationRun,
}));

import { POST as createCombined } from "@/app/api/raster/combined/route";
import { POST as startCombinedRun } from "@/app/api/raster/combined/[id]/runs/route";

describe("combined raster runs", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts a two-scope selection with gaps and no readiness refusal", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.create.mockResolvedValue({
      id: "input-1",
    } as never);
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      status: "DRAFT",
      spannedScopes: [
        { scope: { code: "scope-a" } },
        { scope: { code: "scope-b" } },
      ],
    } as never);
    startOptimizationRun.mockResolvedValue({ id: "run-1" });

    const createResponse = await createCombined(
      new Request("http://localhost/api/raster/combined", {
        method: "POST",
        body: JSON.stringify({
          scopeIds: ["scope-a", "scope-b"],
          name: "Combined",
        }),
      }),
    );
    expect(createResponse.status).toBe(201);

    const runResponse = await startCombinedRun(
      new Request("http://localhost/api/raster/combined/input-1/runs", {
        method: "POST",
        body: JSON.stringify({ timeLimitSeconds: 60 }),
      }),
      { params: Promise.resolve({ id: "input-1" }) },
    );

    expect(runResponse.status).toBe(202);
    expect(startOptimizationRun).toHaveBeenCalledWith(
      expect.objectContaining({ inputSetId: "input-1" }),
    );
  });

  it("refuses a one-scope selection", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    const response = await createCombined(
      new Request("http://localhost/api/raster/combined", {
        method: "POST",
        body: JSON.stringify({ scopeIds: ["scope-a"], name: "Combined" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("refuses inaccessible scopes", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    const response = await createCombined(
      new Request("http://localhost/api/raster/combined", {
        method: "POST",
        body: JSON.stringify({
          scopeIds: ["scope-a", "scope-c"],
          name: "Combined",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
