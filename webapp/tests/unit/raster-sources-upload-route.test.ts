import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser, saveFile, upsertRasterSource } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  saveFile: vi.fn(),
  upsertRasterSource: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/lib/file-storage", () => ({
  saveFile,
}));

vi.mock("@/services/raster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/raster")>()),
  upsertRasterSource,
}));

import { POST } from "@/app/api/raster/sources/upload/route";

describe("raster source upload route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves uploaded files as scoped raster sources", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({ id: "wttv" } as never);
    saveFile.mockResolvedValue("uploads/2026/07/source.pdf");
    upsertRasterSource.mockResolvedValue({ id: "source-1" });

    const formData = new FormData();
    formData.set("scopeCode", "WTTV");
    formData.set("sourceType", "WISHES_PDF");
    formData.set("displayName", "WTTV wishes");
    formData.set("file", new File(["pdf"], "wishes.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    expect(saveFile).toHaveBeenCalledWith(expect.any(Buffer), "wishes.pdf");
    expect(upsertRasterSource).toHaveBeenCalledWith({
      scopeId: "wttv",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/source.pdf",
      displayName: "WTTV wishes",
    });
  });
});
