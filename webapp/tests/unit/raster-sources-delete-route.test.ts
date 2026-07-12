import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { deleteRasterSource, requireApiUser } = vi.hoisted(() => ({
  deleteRasterSource: vi.fn(),
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
  deleteRasterSource,
}));

import { DELETE } from "@/app/api/raster/sources/[id]/route";

describe("raster source delete route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deletes an existing source for platform admins", async () => {
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
    deleteRasterSource.mockResolvedValue({ id: "source-1" });

    const response = await DELETE(
      new Request("http://localhost/api/raster/sources/source-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(200);
    expect(deleteRasterSource).toHaveBeenCalledWith("source-1");
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

    const response = await DELETE(
      new Request("http://localhost/api/raster/sources/missing", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    expect(deleteRasterSource).not.toHaveBeenCalled();
  });
});
