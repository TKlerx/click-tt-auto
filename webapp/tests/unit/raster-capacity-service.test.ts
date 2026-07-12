import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { inferHallCapacitiesFromInputSet } from "@/services/raster";
import { HallCapacityBasis } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster capacity service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("infers long-lived hall capacity rows without overwriting reviewed rows", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      district: "OWL",
      seasonModelJson: JSON.stringify({
        teams: [
          {
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
          {
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "B",
          },
        ],
      }),
    } as never);
    prismaMock.rasterHallCapacity.findUnique.mockResolvedValue({
      basis: HallCapacityBasis.REVIEWED,
    } as never);

    await expect(
      inferHallCapacitiesFromInputSet("input-1", "admin-1"),
    ).resolves.toEqual({ count: 0 });

    expect(prismaMock.rasterHallCapacity.upsert).not.toHaveBeenCalled();
  });
});
