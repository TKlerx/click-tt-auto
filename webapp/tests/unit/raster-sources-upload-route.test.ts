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
    formData.set("file", new File(["%PDF-1.4"], "wishes.pdf"));

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
      season: "2026/27",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/source.pdf",
      displayName: "WTTV wishes",
    });
  });

  it("saves multiple uploaded files as separate sources", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({ id: "owl" } as never);
    saveFile
      .mockResolvedValueOnce("uploads/2026/07/wishes-a.pdf")
      .mockResolvedValueOnce("uploads/2026/07/wishes-b.pdf");
    upsertRasterSource
      .mockResolvedValueOnce({ id: "source-a" })
      .mockResolvedValueOnce({ id: "source-b" });

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("sourceType", "WISHES_PDF");
    formData.append("file", new File(["%PDF-1.4 a"], "wishes-a.pdf"));
    formData.append("file", new File(["%PDF-1.4 b"], "wishes-b.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );
    const body = (await response.json()) as { sources: unknown[] };

    expect(response.status).toBe(201);
    expect(body.sources).toHaveLength(2);
    expect(saveFile).toHaveBeenCalledTimes(2);
    expect(upsertRasterSource).toHaveBeenNthCalledWith(1, {
      scopeId: "owl",
      season: "2026/27",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/wishes-a.pdf",
      displayName: "wishes-a.pdf",
    });
    expect(upsertRasterSource).toHaveBeenNthCalledWith(2, {
      scopeId: "owl",
      season: "2026/27",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/wishes-b.pdf",
      displayName: "wishes-b.pdf",
    });
  });

  it("rejects wish PDF uploads that are not PDFs", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({ id: "owl" } as never);

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("sourceType", "WISHES_PDF");
    formData.set("file", new File(["not a pdf"], "wishes.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(422);
    expect(saveFile).not.toHaveBeenCalled();
    expect(upsertRasterSource).not.toHaveBeenCalled();
  });
});
