import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  canAccessRasterScope,
  listAccessibleRasterScopes,
} from "@/lib/raster/access";
import { Role } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

describe("scope exact-match access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses exact scope assignments for scoped users", async () => {
    prismaMock.scope.findMany.mockResolvedValue([scope("OWL")] as never);
    prismaMock.scope.findFirst.mockResolvedValue(null);

    await expect(
      listAccessibleRasterScopes({ id: "user-1", role: Role.SCOPE_USER }),
    ).resolves.toMatchObject([{ code: "OWL" }]);
    await expect(
      canAccessRasterScope({ id: "user-1", role: Role.SCOPE_USER }, "KOELN"),
    ).resolves.toBe(false);

    expect(prismaMock.scope.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userAssignments: { some: { userId: "user-1" } } },
      }),
    );
    expect(prismaMock.scope.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: "KOELN",
          userAssignments: { some: { userId: "user-1" } },
        },
      }),
    );
  });

  it("lets platform admins list every selectable scope without assignments", async () => {
    prismaMock.scope.findMany.mockResolvedValue([scope("OWL")] as never);

    await expect(
      listAccessibleRasterScopes({ id: "admin-1", role: Role.PLATFORM_ADMIN }),
    ).resolves.toMatchObject([{ code: "OWL" }]);

    expect(prismaMock.scope.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });
});

function scope(code: string) {
  return {
    id: `scope-${code}`,
    code,
    name: code,
    parent: {
      code: "WTTV",
      name: "WTTV",
      parent: { code: "DE", name: "Germany" },
    },
  };
}
