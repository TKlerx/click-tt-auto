import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { refreshRasterSource, requireApiUser } = vi.hoisted(() => ({
  refreshRasterSource: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/services/raster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/raster")>()),
  refreshRasterSource,
}));

import { POST } from "@/app/api/raster/sources/[id]/refresh/route";

describe("raster source refresh route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes an existing source for platform admins", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterSource.findUnique.mockResolvedValue({
      id: "source-1",
      scope: { code: "WTTV" },
    } as never);
    refreshRasterSource.mockResolvedValue({ id: "source-1" });

    const response = await POST(
      new Request("http://localhost/api/raster/sources/source-1/refresh", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(200);
    expect(refreshRasterSource).toHaveBeenCalledWith("source-1");
  });

  it("returns 404 for missing sources", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterSource.findUnique.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/raster/sources/missing/refresh", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    expect(refreshRasterSource).not.toHaveBeenCalled();
  });
});
