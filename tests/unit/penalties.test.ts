import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/raster/score/index.js";
import type { SeasonModel } from "../../src/raster/types.js";

function model(): SeasonModel {
  return {
    clubs: [
      {
        id: "club",
        name: "Club",
        venues: [{ hall: "1", name: "Hall", capacity: 1 }],
        notes: ""
      }
    ],
    teams: [
      {
        id: "a",
        clubId: "club",
        label: "Erwachsene",
        group: { league: "L", name: "G" },
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      },
      {
        id: "b",
        clubId: "club",
        label: "Erwachsene II",
        group: { league: "L", name: "G" },
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      }
    ],
    groups: [
      { ref: { league: "L", name: "G" }, size: 12, teamIds: ["a", "b"] }
    ],
    wishes: [
      {
        clubId: "club",
        teamA: "a",
        teamB: "b",
        relation: "wechsel",
        source: "freetext",
        confidence: "review"
      }
    ],
    absoluteConstraints: [],
    warnings: []
  };
}

describe("raster scoring", () => {
  it("counts over-usage and broken wishes", () => {
    const result = evaluate(model(), { a: 6, b: 7 });
    expect(result.overUsages.length).toBeGreaterThan(0);
    expect(result.wishResults[0]?.status).toBe("unfulfilled");
  });

  it("fulfills a wechsel wish independently from real calendar hall clashes", () => {
    const result = evaluate(model(), { a: 6, b: 12 });
    expect(result.overUsages).toHaveLength(3);
    expect(result.wishResults[0]?.status).toBe("fulfilled");
  });

  it("treats missing hall capacity as unlimited", () => {
    const unlimited = model();
    unlimited.clubs[0]!.venues = [{ hall: "1", name: "Hall" }];
    expect(evaluate(unlimited, { a: 6, b: 7 }).overUsages).toHaveLength(0);
  });
});
