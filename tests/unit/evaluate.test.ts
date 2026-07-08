import { describe, expect, it } from "vitest";
import fixture from "../fixtures/raster/reference-group.json" with { type: "json" };
import { evaluate } from "../../src/raster/score/index.js";
import type { Assignment, SeasonModel } from "../../src/raster/types.js";

describe("raster evaluation", () => {
  it("matches the hand reference fixture", () => {
    const model = fixture.model as unknown as SeasonModel;
    const assignment: Assignment = fixture.assignment;
    const result = evaluate(model, assignment);
    expect(result.objective).toBe(fixture.expected.objective);
    expect(result.overUsages).toHaveLength(fixture.expected.overUsages);
    expect(result.wishResults.filter((wish) => wish.status === "unfulfilled")).toHaveLength(
      fixture.expected.unfulfilledWishes
    );
  });

  it("refuses unsupported group sizes", () => {
    const baseModel = fixture.model as unknown as SeasonModel;
    const model = {
      ...baseModel,
      groups: [{ ref: { league: "L", name: "Bad" }, size: 8, teamIds: ["a", "b"] }]
    };
    expect(() => evaluate(model, fixture.assignment)).toThrow(/Unsupported group size/);
  });
});
