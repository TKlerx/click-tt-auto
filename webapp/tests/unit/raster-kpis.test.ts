import { describe, expect, it } from "vitest";
import {
  kpiSummaryFromSnapshot,
  parseObjectiveBreakdown,
} from "@/lib/raster/kpis";

describe("raster KPI mapping", () => {
  it("maps snapshot totals and objective breakdown into shared KPIs", () => {
    expect(
      kpiSummaryFromSnapshot({
        totalExcess: 7,
        maxExcess: 3,
        affectedClubs: 4,
        objectiveBreakdown: JSON.stringify({
          wechsel: 2,
          zeitgleich: 1,
          sameClubDerbySt4: 5,
        }),
        run: {
          objectiveValue: 123,
          outcome: "FEASIBLE",
          solverStatus: "FEASIBLE",
        },
      }),
    ).toEqual({
      objective: 123,
      totalHallExcess: 7,
      maxHallExcess: 3,
      affectedClubs: 4,
      wishMisses: 3,
      sameClubDerbyIssues: 5,
      status: "FEASIBLE",
    });
  });

  it("treats malformed objective breakdown as empty", () => {
    expect(parseObjectiveBreakdown("{not json")).toMatchObject({
      wechsel: 0,
      zeitgleich: 0,
      sameClubDerbySt4: 0,
    });
  });
});
