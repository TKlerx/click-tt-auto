import { describe, expect, it } from "vitest";
import { optimize } from "../../src/raster/optimize/index.js";
import { evaluate } from "../../src/raster/score/index.js";
import type { SeasonModel } from "../../src/raster/types.js";

describe("raster optimizer", () => {
  it("does not return a worse assignment", () => {
    const model: SeasonModel = {
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
          label: "A",
          group: { league: "L", name: "G" },
          homeWeekday: "friday",
          hall: "1",
          rasterzahl: { kind: "assignable" },
          confidence: "ok"
        },
        {
          id: "b",
          clubId: "club",
          label: "B",
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
    const start = { a: 6, b: 7 };
    const result = optimize(model, start);
    expect(evaluate(model, result).objective).toBeLessThanOrEqual(
      evaluate(model, start).objective
    );
  });
});
