import { describe, expect, it } from "vitest";
import fixture from "../fixtures/raster/reference-group.json" with { type: "json" };
import { evaluate, overUsageFairnessCost } from "../../src/raster/score/index.js";
import type { Assignment, OverUsage, SeasonModel } from "../../src/raster/types.js";

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

  it("reports Spielwoche misses without default penalty", () => {
    const model = fixture.model as unknown as SeasonModel;
    model.teams[0]!.spielwochePref = "B";
    const result = evaluate(model, fixture.assignment);

    expect(result.spielwocheMisses).toHaveLength(1);
    expect(result.objective).toBe(fixture.expected.objective);
  });

  it("penalizes concentrated hall excess more than spread excess", () => {
    const usage = (clubId: string): OverUsage => ({
      clubId,
      hall: "1",
      weekday: "friday",
      week: 1,
      teams: [],
      capacity: 1,
      excess: 1
    });

    expect(overUsageFairnessCost([usage("a"), usage("a")])).toBeGreaterThan(
      overUsageFairnessCost([usage("a"), usage("b")])
    );
  });
});
