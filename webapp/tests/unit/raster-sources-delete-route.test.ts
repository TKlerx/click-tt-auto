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

import { DELETE, PATCH } from "@/app/api/raster/sources/[id]/route";

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
      sourceType: "WISHES_PDF",
      displayName: "Wishes",
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

  it("updates corrected parsed JSON for admins", async () => {
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
    prismaMock.rasterSource.update.mockResolvedValue({
      id: "source-1",
      parsedJson: '{"wishes":[]}',
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/raster/sources/source-1", {
        method: "PATCH",
        body: JSON.stringify({ parsedJson: '{"wishes":[]}' }),
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.rasterSource.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: { parsedJson: '{"wishes":[]}' },
    });
    expect(prismaMock.auditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "RASTER_INPUT_UPLOADED",
          entityType: "RasterSource",
          entityId: "source-1",
          actorId: "admin-1",
          details: expect.stringContaining("parsed_source_corrected"),
        }),
      }),
    );
  });

  it("rejects invalid parsed JSON corrections", async () => {
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

    const response = await PATCH(
      new Request("http://localhost/api/raster/sources/source-1", {
        method: "PATCH",
        body: JSON.stringify({ parsedJson: "{" }),
      }),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    expect(response.status).toBe(422);
    expect(prismaMock.rasterSource.update).not.toHaveBeenCalled();
  });
});
