import { describe, expect, it } from "vitest";
import { computeCoverageRecord } from "@/lib/raster/coverage";

describe("upper-league coverage", () => {
  it("records imported upper-league facts and keeps gaps incomplete", () => {
    const record = computeCoverageRecord({
      spannedScopeIds: ["owl"],
      allScopeIds: ["owl"],
      seasonModelJson: JSON.stringify({
        groups: [],
        teams: [],
        upperLeague: {
          importPresent: true,
          matched: [{ clubId: "tura-elsen", label: "Erwachsene", rasterzahl: 5 }],
          unmatched: [],
          excludedNoHall: [],
        },
      }),
      capacityReview: { rows: [] },
    });

    expect(record.complete).toBe(true);
    expect(record.upperLeague.matched).toEqual([
      { clubId: "tura-elsen", label: "Erwachsene", rasterzahl: 5 },
    ]);

    expect(
      computeCoverageRecord({
        spannedScopeIds: ["owl"],
        allScopeIds: ["owl"],
        seasonModelJson: JSON.stringify({
          groups: [],
          teams: [],
          upperLeague: {
            importPresent: false,
            matched: [],
            unmatched: [],
            excludedNoHall: [],
          },
        }),
        capacityReview: { rows: [] },
      }).complete,
    ).toBe(false);
  });
});
