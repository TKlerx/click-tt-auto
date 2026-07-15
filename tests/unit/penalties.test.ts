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

  it("does not count same-day matches as excess when start times do not overlap", () => {
    const staggered = model();
    staggered.teams[0]!.startTime = "17:00";
    staggered.teams[1]!.startTime = "20:00";

    expect(evaluate(staggered, { a: 6, b: 7 }).overUsages).toHaveLength(0);
  });

  it("uses two-hour duration for youth matches", () => {
    const youth = model();
    youth.teams[0]!.label = "Jugend 19";
    youth.teams[0]!.startTime = "18:15";
    youth.teams[1]!.startTime = "20:15";

    expect(evaluate(youth, { a: 6, b: 7 }).overUsages).toHaveLength(0);
  });

  // "Jugend 19" above is the label splitTeamName actually produces, and every
  // implementation of this rule agrees on it -- which is why nothing caught
  // solve-raster-cpsat.py matching "jugend" as a substring where this file and
  // webapp/worker/.../db.py use a word boundary. This label discriminates:
  // word-boundary => adult => 180min => the 20:15 match overlaps => conflicts.
  // Substring => youth => 120min => no overlap => zero. Keep all three in step.
  it("treats a label merely containing 'jugend' as adult, not youth", () => {
    const adult = model();
    adult.teams[0]!.label = "Jugendliga Nord";
    adult.teams[0]!.startTime = "18:15";
    adult.teams[1]!.startTime = "20:15";

    // 18:15 + 180min = 21:15 overlaps 20:15, so both are concurrent against a
    // capacity of 1 -- in every week the two teams share.
    expect(evaluate(adult, { a: 6, b: 7 }).overUsages.length).toBeGreaterThan(0);
  });

  it("infers hall-day capacity from Spielwoche wishes", () => {
    const inferred = model();
    inferred.clubs[0]!.venues = [{ hall: "1", name: "Hall" }];
    inferred.teams.push({
      id: "c",
      clubId: "club",
      label: "Erwachsene III",
      group: { league: "L", name: "G" },
      homeWeekday: "friday",
      hall: "1",
      rasterzahl: { kind: "assignable" },
      confidence: "ok"
    });
    inferred.groups[0]!.teamIds.push("c");
    inferred.teams[0]!.spielwochePref = "A";
    inferred.teams[1]!.spielwochePref = "A";

    const result = evaluate(inferred, { a: 1, b: 4, c: 5 });

    expect(result.overUsages).toContainEqual(
      expect.objectContaining({ week: 1, capacity: 2, excess: 1 })
    );
  });
});
