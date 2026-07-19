import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  canAccessRasterScope,
  listAccessibleRasterScopes,
} from "@/lib/raster/access";
import { Role } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("checks only the exact assigned scope", async () => {
    prismaMock.scope.findFirst.mockResolvedValue({ id: "owl" } as never);

    await expect(
      canAccessRasterScope({ id: "user-1", role: Role.SCOPE_USER }, "OWL"),
    ).resolves.toBe(true);

    expect(prismaMock.scope.findFirst).toHaveBeenCalledWith({
      where: {
        code: "OWL",
        userAssignments: { some: { userId: "user-1" } },
      },
      select: { id: true },
    });
  });

  it("lists scopes a scoped user may open", async () => {
    prismaMock.scope.findMany.mockResolvedValue([
      {
        code: "OWL",
        name: "Ostwestfalen-Lippe",
        parent: {
          code: "WTTV",
          name: "Westdeutscher Tischtennis-Verband",
          parent: { code: "DE", name: "Germany" },
        },
      },
    ] as never);

    await expect(
      listAccessibleRasterScopes({ id: "user-1", role: Role.SCOPE_USER }),
    ).resolves.toEqual([
      {
        code: "OWL",
        name: "Ostwestfalen-Lippe",
        parent: {
          code: "WTTV",
          name: "Westdeutscher Tischtennis-Verband",
          parent: { code: "DE", name: "Germany" },
        },
      },
    ]);

    expect(prismaMock.scope.findMany).toHaveBeenCalledWith({
      where: { userAssignments: { some: { userId: "user-1" } } },
      select: {
        code: true,
        id: true,
        name: true,
        parent: {
          select: {
            code: true,
            name: true,
            parent: { select: { code: true, name: true } },
          },
        },
      },
    });
  });

  it("sorts accessible scopes by hierarchy path", async () => {
    prismaMock.scope.findMany.mockResolvedValue([
      {
        code: "OWL",
        name: "Ostwestfalen-Lippe",
        parent: {
          code: "WTTV",
          name: "Westdeutscher Tischtennis-Verband",
          parent: { code: "DE", name: "Germany" },
        },
      },
      {
        code: "AACHEN_EUREGIO",
        name: "Aachen/Euregio",
        parent: {
          code: "WTTV",
          name: "Westdeutscher Tischtennis-Verband",
          parent: { code: "DE", name: "Germany" },
        },
      },
    ] as never);

    await expect(
      listAccessibleRasterScopes({ id: "admin-1", role: Role.PLATFORM_ADMIN }),
    ).resolves.toMatchObject([{ code: "AACHEN_EUREGIO" }, { code: "OWL" }]);
  });

  it("excludes the Germany root from accessible raster scopes", async () => {
    prismaMock.scope.findMany.mockResolvedValue([
      { code: "DE", name: "Germany", parent: null },
      {
        code: "WTTV",
        name: "Westdeutscher Tischtennis-Verband",
        parent: { code: "DE", name: "Germany", parent: null },
      },
    ] as never);

    await expect(
      listAccessibleRasterScopes({ id: "admin-1", role: Role.PLATFORM_ADMIN }),
    ).resolves.toMatchObject([{ code: "WTTV" }]);
  });
});
