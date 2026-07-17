import { describe, expect, it } from "vitest";
import { computeCoverageRecord } from "@/lib/raster/coverage";

describe("computeCoverageRecord completeness", () => {
  it("requires every scope and no gaps", () => {
    expect(
      computeCoverageRecord({
        spannedScopeIds: ["a", "b"],
        allScopeIds: ["a", "b"],
        seasonModelJson: JSON.stringify({ groups: [], teams: [] }),
        capacityReview: { rows: [] },
      }).complete,
    ).toBe(true);

    expect(
      computeCoverageRecord({
        spannedScopeIds: ["a", "b"],
        allScopeIds: ["a", "b"],
        seasonModelJson: JSON.stringify({
          groups: [{ id: "g1", planningStatus: "exclude" }],
          teams: [],
        }),
        capacityReview: { rows: [] },
      }).complete,
    ).toBe(false);

    expect(
      computeCoverageRecord({
        spannedScopeIds: ["a"],
        allScopeIds: ["a", "b"],
        seasonModelJson: JSON.stringify({ groups: [], teams: [] }),
        capacityReview: { rows: [] },
      }).complete,
    ).toBe(false);
  });
});
