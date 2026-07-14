import { describe, expect, it } from "vitest";
import { buildProjectionReviewRows } from "@/components/raster/sources/source-projection";

describe("raster source projection review", () => {
  it("matches PDF clubs with legal suffixes to season-model clubs", () => {
    const rows = buildProjectionReviewRows(
      JSON.stringify({
        clubs: [{ id: "ttv-lage-e-v-42614", name: "TTV Lage e.V." }],
        teams: [
          {
            clubId: "ttv-lage-e-v-42614",
            label: "Erwachsene IV",
            homeWeekday: "friday",
            hall: "1",
            startTime: "20:00",
            spielwochePref: "B",
          },
        ],
      }),
      JSON.stringify({
        clubs: [{ id: "ttv-lage-e-v-42614", name: "TTV Lage" }],
        teams: [
          {
            id: "1-bezirksklasse-erwachsene-4-ttv-lage-iv",
            clubId: "ttv-lage-e-v-42614",
            label: "Erwachsene IV",
            homeWeekday: "friday",
            hall: "1",
            startTime: "20:00",
            spielwochePref: "B",
          },
        ],
      }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        status: "matched",
        sourceClub: "TTV Lage e.V.",
        sourceTeam: "Erwachsene IV",
        parsed: "friday, 20:00, Gym 1, WB",
        applied: "friday, 20:00, Gym 1, WB",
      }),
    ]);
  });
});
