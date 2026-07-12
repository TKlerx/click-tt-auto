import { describe, expect, it } from "vitest";
import { rasterIngest } from "@/lib/raster/pipeline";
import type { SeasonModel } from "../../../src/raster/types";

function fixedModel(): SeasonModel {
  return {
    clubs: [{ id: "elsen", name: "TuRa Elsen", venues: [], notes: "" }],
    teams: [
      {
        id: "elsen-1",
        clubId: "elsen",
        label: "TuRa Elsen I",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 3 },
        confidence: "ok",
      },
      {
        id: "elsen-2",
        clubId: "elsen",
        label: "TuRa Elsen II",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok",
      },
    ],
    groups: [
      {
        ref: { league: "L", name: "G12" },
        size: 12,
        teamIds: ["elsen-1", "elsen-2"],
      },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
}

describe("snapshot hard constraints", () => {
  it("preserves fixed Rasterzahlen before snapshot persistence", async () => {
    const result = await rasterIngest.scoreAssignment(fixedModel(), {
      "elsen-1": 4,
      "elsen-2": 4,
    });
    expect(result.assignment["elsen-1"]).toBe(3);
  });

  it("rejects same-club derbies after Spieltag 4", async () => {
    const result = await rasterIngest.scoreAssignment(fixedModel(), {
      "elsen-1": 1,
      "elsen-2": 7,
    });
    expect(result.hardViolations.map((violation) => violation.detail).join("; ")).toMatch(
      /Spieltag/,
    );
  });
});
