import { afterEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser, createCombinedInputSet } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  createCombinedInputSet: vi.fn(),
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/lib/raster/access", () => ({
  canUseRasterLevel: () => true,
}));

vi.mock("@/services/raster", () => ({
  createCombinedInputSet,
}));

import { POST } from "@/app/api/raster/combined/route";

describe("raster combined route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a combined input set", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    createCombinedInputSet.mockResolvedValue({ id: "input-1" });

    const response = await POST(
      new Request("http://localhost/api/raster/combined", {
        method: "POST",
        body: JSON.stringify({
          scopeIds: ["scope-a", "scope-b"],
          name: "Combined",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createCombinedInputSet).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: "admin-1" }),
      scopeIds: ["scope-a", "scope-b"],
      ownerScopeId: "scope-a",
      season: "2026/27",
      name: "Combined",
    });
  });
});
