import { describe, expect, it } from "vitest";
import fixture from "../fixtures/raster/reference-group.json" with { type: "json" };
import { evaluate, overUsageFairnessCost } from "../../src/raster/score/index.js";
import { defaultWeights, type Assignment, type OverUsage, type SeasonModel } from "../../src/raster/types.js";

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
      groups: [{ ref: { league: "L", name: "Bad" }, size: 5, teamIds: ["a", "b"] }]
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

  it("penalizes ST4 same-club derbies and rejects later derbies", () => {
    const model: SeasonModel = {
      clubs: [{ id: "elsen", name: "TuRa Elsen", venues: [], notes: "" }],
      teams: [
        {
          id: "elsen-1",
          clubId: "elsen",
          label: "TuRa Elsen I",
          homeWeekday: "friday",
          hall: "1",
          rasterzahl: { kind: "assignable" },
          confidence: "ok"
        },
        {
          id: "elsen-2",
          clubId: "elsen",
          label: "TuRa Elsen II",
          homeWeekday: "friday",
          hall: "1",
          rasterzahl: { kind: "assignable" },
          confidence: "ok"
        }
      ],
      groups: [{ ref: { league: "L", name: "G12" }, size: 12, teamIds: ["elsen-1", "elsen-2"] }],
      wishes: [],
      absoluteConstraints: [],
      warnings: []
    };

    const fallback = evaluate(model, { "elsen-1": 3, "elsen-2": 4 });
    expect(fallback.hardViolations).toHaveLength(0);
    expect(fallback.objective).toBe(defaultWeights.sameClubDerbySt4);

    const late = evaluate(model, { "elsen-1": 1, "elsen-2": 7 });
    expect(late.hardViolations).toContainEqual(
      expect.objectContaining({ kind: "derby-late" })
    );
  });
});
