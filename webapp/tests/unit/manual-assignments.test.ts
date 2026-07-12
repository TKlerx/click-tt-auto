import { describe, expect, it } from "vitest";
import { validateManualAssignmentRows } from "@/lib/raster/manualAssignments";
import type { SeasonModel } from "../../../src/raster/types";

describe("manual assignment validation", () => {
  it("reports duplicate, illegal, missing, and unknown rows", () => {
    const result = validateManualAssignmentRows(model(), [
      { teamLabel: "Team A", rasterzahl: 1 },
      { teamLabel: "Team B", rasterzahl: 1 },
      { teamLabel: "Team B", rasterzahl: 2 },
      { teamLabel: "Team C", rasterzahl: 7 },
      { teamLabel: "Ghost", rasterzahl: 3 },
    ]);

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate_rasterzahl",
        "duplicate_team",
        "illegal_rasterzahl",
        "missing_team",
        "unknown_team",
      ]),
    );
  });
});

function model(): SeasonModel {
  return {
    clubs: [
      { id: "club", name: "Club", venues: [], notes: "" },
      { id: "club-2", name: "Club 2", venues: [], notes: "" },
    ],
    teams: [
      team("a", "Team A", "club"),
      team("b", "Team B", "club"),
      team("c", "Team C", "club-2"),
      team("d", "Team D", "club-2"),
      team("e", "Team E", "club-2"),
    ],
    groups: [
      {
        ref: { league: "Liga", name: "Gruppe" },
        size: 5,
        teamIds: ["a", "b", "c", "d", "e"],
      },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
}

function team(
  id: string,
  label: string,
  clubId: string,
): SeasonModel["teams"][number] {
  return {
    id,
    clubId,
    label,
    homeWeekday: "friday",
    hall: "1",
    rasterzahl: { kind: "assignable" },
    confidence: "ok",
  };
}
