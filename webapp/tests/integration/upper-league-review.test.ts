import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { listUpperLeagueReview } from "@/services/raster/upperLeague";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

describe("upper-league import review", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports matched, unmatched, and excluded-no-hall teams before a run", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      scopeId: "scope-owl",
      season: "2026/27",
      seasonModelJson: JSON.stringify({
        clubs: [
          { id: "club-a", name: "TuRa Elsen" },
          { id: "club-b", name: "DJK Paderborn" },
        ],
        teams: [],
        groups: [],
      }),
      spannedScopes: [],
    } as never);
    prismaMock.rasterSource.findFirst.mockResolvedValue({
      parsedJson: JSON.stringify({
        sourceLabel: "gruppen.pdf",
        leagues: [
          {
            league: "Verbandsliga 1 Erwachsene",
            size: 11,
            entries: [
              { rasterzahl: 5, team: "TuRa Elsen" },
              { rasterzahl: 7, team: "DJK Paderborn" },
            ],
          },
        ],
      }),
    } as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wish-a",
        clubId: "club-a",
        clubName: "TuRa Elsen",
        teamLabel: "Erwachsene",
        homeWeekday: "SATURDAY",
        hall: "1",
      },
      {
        id: "wish-b",
        clubId: "club-b",
        clubName: "DJK Paderborn",
        teamLabel: "Erwachsene",
        homeWeekday: "SATURDAY",
        hall: null,
      },
      {
        id: "wish-c",
        clubId: "club-a",
        clubName: "TuRa Elsen",
        teamLabel: "Damen",
        homeWeekday: "SUNDAY",
        hall: "1",
      },
    ] as never);

    await expect(listUpperLeagueReview("input-1")).resolves.toEqual({
      importPresent: true,
      matched: [{ clubId: "club-a", label: "Erwachsene", rasterzahl: 5 }],
      unmatched: [{ clubId: "club-a", label: "Damen" }],
      excludedNoHall: [{ clubId: "club-b", label: "Erwachsene" }],
    });
  });
});
