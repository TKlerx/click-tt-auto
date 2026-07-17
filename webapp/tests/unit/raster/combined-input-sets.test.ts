import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { createCombinedInputSet } from "@/services/raster/combinedInputSets";
import { Role } from "../../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/raster/access", () => ({
  listAccessibleRasterScopes: vi
    .fn()
    .mockResolvedValue([{ id: "scope-a" }, { id: "scope-b" }]),
}));

describe("createCombinedInputSet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects one-scope selections", async () => {
    await expect(
      createCombinedInputSet({
        user: { id: "user-1", role: Role.SCOPE_ADMIN },
        scopeIds: ["scope-a"],
        ownerScopeId: "scope-a",
        season: "2026/27",
        name: "Combined",
      }),
    ).rejects.toThrow("at least two scopes");
  });

  it("rejects inaccessible scopes", async () => {
    await expect(
      createCombinedInputSet({
        user: { id: "user-1", role: Role.SCOPE_ADMIN },
        scopeIds: ["scope-a", "scope-c"],
        ownerScopeId: "scope-a",
        season: "2026/27",
        name: "Combined",
      }),
    ).rejects.toThrow("Not authorized");
  });

  it("creates the owning input set and spanned scope rows", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.create.mockResolvedValue({
      id: "input-1",
      name: "Combined",
    } as never);

    await createCombinedInputSet({
      user: { id: "user-1", role: Role.SCOPE_ADMIN },
      scopeIds: ["scope-a", "scope-b"],
      ownerScopeId: "scope-a",
      season: "2026/27",
      name: "Combined",
    });

    expect(prismaMock.rasterInputSet.create).toHaveBeenCalledWith({
      data: {
        name: "Combined",
        scopeId: "scope-a",
        season: "2026/27",
        createdById: "user-1",
      },
    });
    expect(prismaMock.rasterInputSetScope.createMany).toHaveBeenCalledWith({
      data: [
        { inputSetId: "input-1", scopeId: "scope-a" },
        { inputSetId: "input-1", scopeId: "scope-b" },
      ],
    });
  });
});
