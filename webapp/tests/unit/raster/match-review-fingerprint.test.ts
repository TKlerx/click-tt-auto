import { describe, expect, it } from "vitest";
import { rasterMatchFingerprint } from "@/lib/raster/match-review";

describe("raster match review fingerprint", () => {
  it("ignores whitespace, diacritics and object ordering churn", () => {
    const left = rasterMatchFingerprint({
      id: "team-1",
      clubId: "TTC Koln",
      label: "Herren 1",
      wishMatchId: "wish-1",
      homeWeekday: "Friday",
      hall: " Halle 1 ",
      startTime: "19:30",
      spielwochePref: "A",
    });
    const right = rasterMatchFingerprint({
      spielwochePref: "A",
      startTime: "19:30",
      hall: "Halle 1",
      homeWeekday: "Friday",
      wishMatchId: "wish-1",
      label: "Herren   1",
      clubId: "TTC Köln",
      id: "team-1",
    });

    expect(right).toBe(left);
  });

  it.each([
    ["wishMatchId", { wishMatchId: "wish-2" }],
    ["homeWeekday", { homeWeekday: "Saturday" }],
    ["hall", { hall: "2" }],
    ["startTime", { startTime: "20:00" }],
    ["spielwochePref", { spielwochePref: "B" }],
  ])("changes when %s changes", (_field, patch) => {
    const base = {
      id: "team-1",
      clubId: "club-1",
      label: "Herren 1",
      wishMatchId: "wish-1",
      homeWeekday: "Friday",
      hall: "1",
      startTime: "19:30",
      spielwochePref: "A",
    };

    expect(rasterMatchFingerprint({ ...base, ...patch })).not.toBe(
      rasterMatchFingerprint(base),
    );
  });
});
