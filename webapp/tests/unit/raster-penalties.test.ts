import { describe, expect, it } from "vitest";

describe("raster penalty events", () => {
  it("reports same-club matches after Spieltag 3", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    const { findSameClubMatchPenalties } =
      await import("@/services/raster/snapshots");
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `a-${index + 1}`,
      league: "L",
      group: "G",
      clubId: index < 2 ? "club-a" : `club-${index}`,
      clubName: index < 2 ? "Club A" : `Club ${index}`,
      team: index < 2 ? `Club A ${index + 1}` : `Other ${index}`,
      rasterzahl: index === 0 ? 1 : index === 1 ? 4 : index + 1,
    }));

    expect(findSameClubMatchPenalties(rows)).toEqual([
      expect.objectContaining({
        severity: "PENALTY",
        clubName: "Club A",
        spieltag: 4,
        teams: ["Club A 1", "Club A 2"],
      }),
    ]);
  });
});
