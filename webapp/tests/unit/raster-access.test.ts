import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { canAccessRasterDistrict } from "@/lib/raster/access";
import { Role } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows scoped users through assigned parent scopes", async () => {
    prismaMock.scope.findFirst.mockResolvedValue({ id: "owl" } as never);

    await expect(
      canAccessRasterDistrict(
        { id: "user-1", role: Role.SCOPE_USER },
        "OWL",
      ),
    ).resolves.toBe(true);

    expect(prismaMock.scope.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ code: "OWL" }, { name: "OWL" }] },
          {
            OR: [
              { userAssignments: { some: { userId: "user-1" } } },
              {
                parent: { userAssignments: { some: { userId: "user-1" } } },
              },
              {
                parent: {
                  parent: {
                    userAssignments: { some: { userId: "user-1" } },
                  },
                },
              },
            ],
          },
        ],
      },
      select: { id: true },
    });
  });
});
