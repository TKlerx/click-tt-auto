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

import { GET, POST } from "@/app/api/raster/sources/route";

describe("raster sources route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists sources visible to a district viewer", async () => {
    requireApiUser.mockResolvedValue({
      user: { id: "user-1", role: Role.SCOPE_USER, status: UserStatus.ACTIVE },
    });
    prismaMock.scope.findFirst
      .mockResolvedValueOnce({ id: "owl" } as never)
      .mockResolvedValueOnce({
        id: "owl",
        parent: { id: "wttv", parent: { id: "de" } },
      } as never);
    prismaMock.rasterSource.findMany.mockResolvedValue([] as never);

    const response = await GET(
      new Request("http://localhost/api/raster/sources?district=OWL"),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.rasterSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scopeId: { in: ["owl", "wttv", "de"] },
          season: "2026/27",
        }),
      }),
    );
  });

  it("upserts sources for raster admins", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({ id: "wttv" } as never);
    prismaMock.rasterSource.upsert.mockResolvedValue({ id: "source-1" } as never);

    const response = await POST(
      new Request("http://localhost/api/raster/sources", {
        method: "POST",
        body: JSON.stringify({
          scopeCode: "WTTV",
          sourceType: "GROUP_ASSIGNMENT",
          sourceRef: "https://example.test/groups.pdf",
          displayName: "WTTV groups",
          parsedJson: "{}",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(prismaMock.rasterSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scopeId: "wttv",
          season: "2026/27",
          sourceType: "GROUP_ASSIGNMENT",
        }),
      }),
    );
  });
});
