import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  inferHallCapacitiesFromInputSet,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";
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
      wishes: [],
      seasonModelJson: JSON.stringify({
        teams: [
          {
            id: "team-a",
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
          {
            id: "team-b",
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "B",
          },
        ],
      }),
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([
      {
        id: "capacity-1",
        district: "OWL",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 1,
      },
    ] as never);

    await expect(
      inferHallCapacitiesFromInputSet("input-1", "admin-1"),
    ).resolves.toEqual({ count: 0, needsReview: 0 });

    expect(prismaMock.rasterHallCapacity.create).not.toHaveBeenCalled();
  });

  it("does not block when stored capacity is equal or larger than inferred capacity", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      district: "OWL",
      wishes: [],
      seasonModelJson: JSON.stringify({
        teams: [
          {
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
        ],
      }),
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([
      {
        district: "OWL",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 2,
        basis: HallCapacityBasis.REVIEWED,
      },
    ] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toEqual({
      inferredCount: 1,
      missingCount: 0,
      insufficientCount: 0,
      blockingCount: 0,
      rows: [],
    });
  });

  it("blocks when inferred capacity exceeds the stored capacity", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      district: "OWL",
      wishes: [],
      seasonModelJson: JSON.stringify({
        teams: [
          {
            id: "team-a",
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
          {
            id: "team-b",
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
        ],
      }),
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([
      {
        id: "capacity-1",
        district: "OWL",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 1,
        basis: HallCapacityBasis.REVIEWED,
      },
    ] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toEqual({
      inferredCount: 1,
      missingCount: 0,
      insufficientCount: 1,
      blockingCount: 1,
      rows: [
        {
          id: "capacity-1",
          district: "OWL",
          clubId: "club-a",
          hall: "1",
          weekday: "FRIDAY",
          capacity: 2,
          storedCapacity: 1,
          basis: HallCapacityBasis.REVIEWED,
          status: "insufficient",
        },
      ],
    });
  });

  it("infers capacities from parsed wishes when the season model has no week preference", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      district: "OWL",
      seasonModelJson: JSON.stringify({
        teams: [
          {
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
          },
        ],
      }),
      wishes: [
        {
          clubId: "club-a",
          hall: "1",
          homeWeekday: "FRIDAY",
          spielwochePref: "A",
        },
        {
          clubId: "club-a",
          hall: "1",
          homeWeekday: "FRIDAY",
          spielwochePref: "A",
        },
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      inferredCount: 1,
      missingCount: 1,
      insufficientCount: 0,
      blockingCount: 1,
      rows: [
        expect.objectContaining({
          clubId: "club-a",
          hall: "1",
          weekday: "FRIDAY",
          capacity: 2,
          status: "missing",
        }),
      ],
    });
  });

  it("does not infer extra capacity for non-overlapping same-day start times", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      district: "OWL",
      seasonModelJson: JSON.stringify({ teams: [] }),
      wishes: [
        {
          clubId: "club-a",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "17:00",
          spielwochePref: "A",
        },
        {
          clubId: "club-a",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "20:00",
          spielwochePref: "A",
        },
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      inferredCount: 1,
      rows: [expect.objectContaining({ capacity: 1 })],
    });
  });

  it("deduplicates wishes and places missing week preference on the lighter slot", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      district: "OWL",
      seasonModelJson: JSON.stringify({ teams: [] }),
      wishes: [
        {
          clubId: "club-a",
          teamLabel: "Team II",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "19:45",
          spielwochePref: "A",
        },
        {
          clubId: "club-a",
          teamLabel: "Team II",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "19:45",
          spielwochePref: "A",
        },
        {
          clubId: "club-a",
          teamLabel: "Jugend 19",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "18:30",
          spielwochePref: null,
        },
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      inferredCount: 1,
      rows: [expect.objectContaining({ capacity: 1 })],
    });
  });
});
