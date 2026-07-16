import { describe, expect, it } from "vitest";
import { computeCoverageRecord } from "@/lib/raster/coverage";

describe("computeCoverageRecord A/B preference", () => {
  it("does not treat missing game week A/B preference as a gap", () => {
    const coverage = computeCoverageRecord({
      spannedScopeIds: ["a"],
      allScopeIds: ["a"],
      seasonModelJson: JSON.stringify({
        groups: [],
        teams: [
          {
            id: "team-1",
            wishMatchId: "wish-1",
            homeWeekday: "MONDAY",
            hall: "1",
            startTime: "19:30",
          },
        ],
      }),
      capacityReview: { rows: [] },
    });

    expect(coverage.wishGaps).toEqual([]);
    expect(coverage.complete).toBe(true);
  });
});
