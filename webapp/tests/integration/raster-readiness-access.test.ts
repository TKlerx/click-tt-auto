import { afterEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUser, buildReadinessAcrossScopes } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  buildReadinessAcrossScopes: vi.fn(),
}));

vi.mock("@/lib/route-auth", () => ({ requireApiUser }));
vi.mock("@/lib/raster/access", () => ({
  assertRasterAccess: vi.fn(),
  resolveRasterScope: vi.fn(),
}));
vi.mock("@/lib/raster/readiness-across-scopes", () => ({
  buildReadinessAcrossScopes,
  buildReadinessForScope: vi.fn(),
}));
vi.mock("@/services/raster", () => ({
  listInputSets: vi.fn(),
  listRasterSourcesForScope: vi.fn(),
  reviewHallCapacitiesForInputSet: vi.fn(),
}));

import { GET } from "@/app/api/raster/readiness/route";

describe("raster readiness access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the accessible scope rows supplied by the access-aware helper", async () => {
    const user = {
      id: "user-1",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
    };
    requireApiUser.mockResolvedValue({ user });
    buildReadinessAcrossScopes.mockResolvedValue([
      {
        scope: { id: "scope-a", code: "A", name: "A" },
        complete: false,
        missing: ["Add source data"],
        resolvedBy: "import",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/raster/readiness?season=2026/27"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scopes: [{ scope: { code: "A" } }],
    });
    expect(buildReadinessAcrossScopes).toHaveBeenCalledWith(user, "2026/27");
  });
});
