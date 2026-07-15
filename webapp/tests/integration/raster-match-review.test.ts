import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listMatchReviewState,
  markMatchReviewRecords,
} from "@/lib/raster/match-review";

const store = vi.hoisted(() => ({
  model: {
    teams: [
      {
        id: "team-1",
        clubId: "club-1",
        label: "Herren 1",
        wishMatchId: "wish-1",
        homeWeekday: "Friday",
        hall: "1",
        startTime: "19:30",
        spielwochePref: "A",
      },
      {
        id: "team-2",
        clubId: "club-2",
        label: "Herren 2",
        wishMatchId: "wish-2",
        homeWeekday: "Friday",
        hall: "1",
        startTime: "19:30",
        spielwochePref: "A",
      },
    ],
  },
  reviews: [] as Array<{ recordId: string; fingerprint: string }>,
}));

const { prisma } = vi.hoisted(() => ({
  prisma: {
    rasterInputSet: {
      findUnique: vi.fn(() => ({
        seasonModelJson: JSON.stringify(store.model),
      })),
    },
    rasterMatchReview: {
      findMany: vi.fn(() => store.reviews),
      upsert: vi.fn(
        ({
          create,
          update,
          where,
        }: {
          create: { recordId: string; fingerprint: string };
          update: { fingerprint: string };
          where: {
            inputSetId_recordType_recordId: { recordId: string };
          };
        }) => {
          const recordId = where.inputSetId_recordType_recordId.recordId;
          const existing = store.reviews.find(
            (review) => review.recordId === recordId,
          );
          if (existing) existing.fingerprint = update.fingerprint;
          else {
            store.reviews.push({
              recordId: create.recordId,
              fingerprint: create.fingerprint,
            });
          }
        },
      ),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma }));

describe("raster match review invalidation", () => {
  afterEach(() => {
    vi.clearAllMocks();
    store.reviews = [];
    store.model.teams[0].startTime = "19:30";
    store.model.teams[1].startTime = "19:30";
  });

  it("keeps reviewed matches settled across repeated checks and reopens only changed records", async () => {
    await markMatchReviewRecords("input-1", ["team-1", "team-2"], "user-1");

    expect(prisma.rasterMatchReview.upsert).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 3; index += 1) {
      await markMatchReviewRecords("input-1", ["team-1", "team-2"], "user-1");
    }
    expect(prisma.rasterMatchReview.upsert).toHaveBeenCalledTimes(2);

    store.model.teams[1].startTime = "20:00";

    const outstanding = (await listMatchReviewState("input-1"))
      .filter((record) => record.status === "outstanding")
      .map((record) => record.recordId);

    expect(outstanding).toEqual(["team-2"]);
  });
});
