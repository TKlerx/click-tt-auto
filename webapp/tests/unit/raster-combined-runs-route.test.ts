import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser, startOptimizationRun, assertRasterAccess, logRasterAudit } =
  vi.hoisted(() => ({
    requireApiUser: vi.fn(),
    startOptimizationRun: vi.fn(),
    assertRasterAccess: vi.fn(),
    logRasterAudit: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/lib/raster/access", () => ({
  canUseRasterLevel: () => true,
  assertRasterAccess,
}));

vi.mock("@/lib/raster/audit", () => ({
  logRasterAudit,
}));

vi.mock("@/services/raster", () => ({
  startOptimizationRun,
}));

import { POST } from "@/app/api/raster/combined/[id]/runs/route";

describe("raster combined runs route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const signedInAdmin = () =>
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

  const combinedInputSet = () =>
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      status: "DRAFT",
      spannedScopes: [{ scope: { code: "a" } }, { scope: { code: "b" } }],
    } as never);

  const startRun = () =>
    POST(
      new Request("http://localhost/api/raster/combined/input-1/runs", {
        method: "POST",
        body: JSON.stringify({ timeLimitSeconds: 60 }),
      }),
      { params: Promise.resolve({ id: "input-1" }) },
    );

  it("starts a combined run without requiring READY status", async () => {
    signedInAdmin();
    combinedInputSet();
    assertRasterAccess.mockResolvedValue(true);
    startOptimizationRun.mockResolvedValue({ id: "run-1" });

    const response = await startRun();

    expect(response.status).toBe(202);
    expect(startOptimizationRun).toHaveBeenCalledWith({
      inputSetId: "input-1",
      startedById: "admin-1",
      settings: { strategy: "cp_sat", timeLimitSeconds: 60, weights: {} },
    });
  });

  it("checks access for every spanned scope, not just one", async () => {
    signedInAdmin();
    combinedInputSet();
    assertRasterAccess.mockResolvedValue(true);
    startOptimizationRun.mockResolvedValue({ id: "run-1" });

    await startRun();

    expect(assertRasterAccess).toHaveBeenCalledTimes(2);
    expect(assertRasterAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1" }),
      "a",
      "admin",
    );
    expect(assertRasterAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1" }),
      "b",
      "admin",
    );
  });

  it("refuses the run when any spanned scope is not accessible", async () => {
    signedInAdmin();
    combinedInputSet();
    assertRasterAccess.mockImplementation(async (_user, code: string) =>
      code === "b"
        ? { error: NextResponse.json({ error: "Nope" }, { status: 403 }) }
        : true,
    );

    const response = await startRun();

    expect(response.status).toBe(403);
    expect(startOptimizationRun).not.toHaveBeenCalled();
  });
});
