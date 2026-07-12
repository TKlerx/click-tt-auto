import { describe, expect, it } from "vitest";
import { parseManualAssignmentPaste } from "@/lib/raster/manualAssignmentImport";

describe("manual assignment import", () => {
  it("parses tabular and pasted team rows", () => {
    expect(parseManualAssignmentPaste("Team A\t1\nTeam B;2\nTeam C 3")).toEqual(
      [
        { teamLabel: "Team A", rasterzahl: 1 },
        { teamLabel: "Team B", rasterzahl: 2 },
        { teamLabel: "Team C", rasterzahl: 3 },
      ],
    );
  });
});
