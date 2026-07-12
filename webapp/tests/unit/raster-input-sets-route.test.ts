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

import { GET, POST } from "@/app/api/raster/input-sets/route";

describe("raster input set route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists district input sets for a scoped viewer", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "viewer-1",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({ id: "scope-1" } as never);
    prismaMock.rasterInputSet.findMany.mockResolvedValue([
      {
        id: "input-1",
        name: "OWL 2026",
        district: "OWL",
        status: "DRAFT",
        createdAt: new Date("2026-07-10T00:00:00Z"),
        _count: { wishes: 0, fixedRasterzahlen: 0, runs: 0 },
      },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/raster/input-sets?district=OWL"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      inputSets: [{ id: "input-1", name: "OWL 2026" }],
    });
  });

  it("creates district input sets for raster admins", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.rasterInputSet.create.mockResolvedValue({
      id: "input-1",
      name: "OWL 2026",
      district: "OWL",
      createdById: "admin-1",
      createdAt: new Date("2026-07-10T00:00:00Z"),
      status: "DRAFT",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/raster/input-sets", {
        method: "POST",
        body: JSON.stringify({ district: "OWL", name: "OWL 2026" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(prismaMock.rasterInputSet.create).toHaveBeenCalledWith({
      data: {
        district: "OWL",
        season: "2026/27",
        name: "OWL 2026",
        createdById: "admin-1",
      },
    });
  });
});
