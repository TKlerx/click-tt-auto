/* eslint-disable max-lines-per-function */
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

  const inputScope = { scopeId: "scope-owl", scope: { code: "OWL" } };

  it("infers long-lived hall capacity rows without overwriting reviewed rows", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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
        scopeId: "scope-owl",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 1,
      },
    ] as never);

    await expect(
      inferHallCapacitiesFromInputSet("input-1", "admin-1"),
    ).resolves.toEqual({ count: 0, needsReview: 0, pruned: 0 });

    expect(prismaMock.rasterHallCapacity.create).not.toHaveBeenCalled();
  });

  it("does not block when stored capacity is equal or larger than inferred capacity", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
      wishes: [],
      seasonModelJson: JSON.stringify({
        teams: [
          {
            clubId: "club-a",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
          {
            clubId: "club-b",
            hall: "1",
            homeWeekday: "saturday",
            spielwochePref: "A",
          },
        ],
      }),
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([
      {
        scopeId: "scope-owl",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 2,
        basis: HallCapacityBasis.REVIEWED,
      },
      {
        scopeId: "scope-owl",
        clubId: "club-b",
        hall: "1",
        weekday: "SATURDAY",
        capacity: 1,
        basis: HallCapacityBasis.REVIEWED,
      },
    ] as never);

    await expect(reviewHallCapacitiesForInputSet("input-1")).resolves.toEqual({
      inferredCount: 2,
      missingCount: 0,
      insufficientCount: 0,
      higherCount: 1,
      blockingCount: 0,
      aliasCandidates: [],
      wishClubOptions: [],
      rows: [
        {
          id: undefined,
          scope: "OWL",
          clubId: "club-a",
          hall: "1",
          weekday: "FRIDAY",
          capacity: 1,
          storedCapacity: 2,
          basis: HallCapacityBasis.REVIEWED,
          status: "higher",
        },
        {
          id: undefined,
          scope: "OWL",
          clubId: "club-b",
          hall: "1",
          weekday: "SATURDAY",
          capacity: 1,
          storedCapacity: 1,
          basis: HallCapacityBasis.REVIEWED,
          status: "ok",
        },
      ],
    });
  });

  it("blocks when inferred capacity exceeds the stored capacity", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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
        scopeId: "scope-owl",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 1,
        basis: HallCapacityBasis.REVIEWED,
      },
    ] as never);

    await expect(reviewHallCapacitiesForInputSet("input-1")).resolves.toEqual({
      inferredCount: 1,
      missingCount: 0,
      insufficientCount: 1,
      higherCount: 0,
      blockingCount: 1,
      aliasCandidates: [],
      wishClubOptions: [],
      rows: [
        {
          id: "capacity-1",
          scope: "OWL",
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

  it("raises stale inferred capacities", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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
        ],
      }),
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([
      {
        id: "capacity-1",
        scopeId: "scope-owl",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 0,
        basis: HallCapacityBasis.INFERRED,
      },
    ] as never);

    await expect(
      inferHallCapacitiesFromInputSet("input-1", "admin-1"),
    ).resolves.toEqual({ count: 1, needsReview: 0, pruned: 0 });
    expect(prismaMock.rasterHallCapacity.update).toHaveBeenCalledWith({
      where: { id: "capacity-1" },
      data: { capacity: 1, updatedById: "admin-1" },
    });
  });

  it("surfaces suspected club aliases without applying them", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
      seasonModelJson: JSON.stringify({
        clubs: [
          { id: "fc-bu-hne", name: "FC Bühne" },
          {
            id: "spfr-berlebeck-heiligenkirchen",
            name: "Spfr. Berlebeck-Heiligenkirchen",
          },
        ],
        teams: [
          {
            clubId: "fc-bu-hne",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
          {
            clubId: "spfr-berlebeck-heiligenkirchen",
            hall: "1",
            homeWeekday: "friday",
            spielwochePref: "A",
          },
        ],
      }),
      wishes: [
        {
          clubId: "fc-b-hne-1929-42518",
          clubName: "FC Bühne 1929",
          teamLabel: "Erwachsene",
          hall: "1",
          homeWeekday: "FRIDAY",
          spielwochePref: "A",
        },
        {
          clubId: "sportfreunde-berlebeck-heiligenkirchen-e-v-42634",
          clubName: "Sportfreunde Berlebeck-Heiligenkirchen e.V.",
          teamLabel: "Erwachsene",
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
      aliasCandidates: [
        {
          modelClubId: "fc-bu-hne",
          modelClubName: "FC Bühne",
          wishClubId: "fc-b-hne-1929-42518",
          wishClubName: "FC Bühne 1929",
        },
        {
          modelClubId: "spfr-berlebeck-heiligenkirchen",
          modelClubName: "Spfr. Berlebeck-Heiligenkirchen",
          wishClubId: "sportfreunde-berlebeck-heiligenkirchen-e-v-42634",
          wishClubName: "Sportfreunde Berlebeck-Heiligenkirchen e.V.",
        },
      ],
      wishClubOptions: [
        {
          clubId: "fc-b-hne-1929-42518",
          clubName: "FC Bühne 1929",
        },
        {
          clubId: "sportfreunde-berlebeck-heiligenkirchen-e-v-42634",
          clubName: "Sportfreunde Berlebeck-Heiligenkirchen e.V.",
        },
      ],
      rows: [
        expect.objectContaining({ clubId: "fc-bu-hne" }),
        expect.objectContaining({
          clubId: "spfr-berlebeck-heiligenkirchen",
        }),
        expect.objectContaining({ clubId: "fc-b-hne-1929-42518" }),
        expect.objectContaining({
          clubId: "sportfreunde-berlebeck-heiligenkirchen-e-v-42634",
        }),
      ],
    });
    expect(prismaMock.rasterHallCapacity.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps reviewed club aliases visible for correction", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
      seasonModelJson: JSON.stringify({
        clubAliases: [
          {
            sourceClubId: "fc-bu-hne",
            sourceClubName: "FC Bühne",
            targetClubId: "fc-b-hne-1929-42518",
            targetClubName: "FC Bühne 1929",
          },
        ],
        clubs: [{ id: "fc-b-hne-1929-42518", name: "FC Bühne 1929" }],
        teams: [
          {
            clubId: "fc-b-hne-1929-42518",
            hall: "1",
            homeWeekday: "friday",
          },
        ],
      }),
      wishes: [
        {
          clubId: "fc-b-hne-1929-42518",
          clubName: "FC Bühne 1929",
          teamLabel: "Erwachsene",
          hall: "1",
          homeWeekday: "FRIDAY",
        },
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      aliasCandidates: [
        {
          confirmed: true,
          modelClubId: "fc-bu-hne",
          wishClubId: "fc-b-hne-1929-42518",
        },
      ],
    });
  });

  it("infers capacities from parsed wishes when the season model has no week preference", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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
          teamLabel: "Team I",
          hall: "1",
          homeWeekday: "FRIDAY",
          spielwochePref: "A",
        },
        {
          clubId: "club-a",
          teamLabel: "Team II",
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
      higherCount: 0,
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

  it("uses wish home slots instead of season-model placeholders for clubs with wishes", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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
          homeWeekday: "MONDAY",
          spielwochePref: "A",
        },
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      inferredCount: 1,
      rows: [
        expect.objectContaining({
          clubId: "club-a",
          weekday: "MONDAY",
          capacity: 1,
        }),
      ],
    });
  });

  it("does not infer extra capacity for non-overlapping same-day start times", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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

  it("uses two-hour duration for youth capacity inference", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
      seasonModelJson: JSON.stringify({ teams: [] }),
      wishes: [
        {
          clubId: "club-a",
          teamLabel: "Jugend 19",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "18:15",
          spielwochePref: "A",
        },
        {
          clubId: "club-a",
          teamLabel: "Erwachsene V",
          hall: "1",
          homeWeekday: "FRIDAY",
          startTime: "20:15",
          spielwochePref: "A",
        },
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ capacity: 1 })],
    });
  });

  it("deduplicates wishes and places missing week preference on the lighter slot", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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

  it("reports stored capacities that are higher than the current inference", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      ...inputScope,
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
      ],
    } as never);
    prismaMock.rasterHallCapacity.findMany.mockResolvedValue([
      {
        id: "capacity-1",
        scopeId: "scope-owl",
        clubId: "club-a",
        hall: "1",
        weekday: "FRIDAY",
        capacity: 6,
        basis: HallCapacityBasis.INFERRED,
      },
    ] as never);

    await expect(
      reviewHallCapacitiesForInputSet("input-1"),
    ).resolves.toMatchObject({
      inferredCount: 1,
      higherCount: 1,
      blockingCount: 0,
      rows: [
        expect.objectContaining({
          status: "higher",
          storedCapacity: 6,
          capacity: 1,
        }),
      ],
    });
  });
});
