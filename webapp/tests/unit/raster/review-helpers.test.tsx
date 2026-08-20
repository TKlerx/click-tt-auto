import { describe, expect, it } from "vitest";
import { extractPlanningGroups } from "@/app/(dashboard)/raster/_lib/review-helpers";

describe("raster review helpers", () => {
  it("does not count excluded group teams as missing", () => {
    const groups = extractPlanningGroups(
      "input-1",
      JSON.stringify({
        teams: [
          { id: "t1", capacityRelevant: false },
          { id: "t2", capacityRelevant: false },
        ],
        groups: [
          {
            id: "g1",
            planningStatus: "exclude",
            teamIds: ["t1", "t2"],
          },
        ],
      }),
      [],
    );

    expect(groups[0]?.missingTeams).toBe(0);
    expect(groups[0]?.teams.map((team) => team.missing)).toEqual([
      "deferred",
      "deferred",
    ]);
  });
});
