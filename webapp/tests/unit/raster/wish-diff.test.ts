import { describe, expect, it } from "vitest";
import { diffWishValues, fingerprintWishValue } from "@/lib/raster/wish-diff";

describe("wish import value diffing", () => {
  const base = {
    homeWeekday: "FRIDAY",
    hall: " Halle 1 ",
    startTime: "19:30",
    spielwochePref: "A",
    requestedRasterzahl: JSON.stringify([3, 8]),
    notes: "TTV Grün-Weiß",
  };

  it("fingerprints normalized identical values identically", () => {
    expect(fingerprintWishValue(base)).toBe(
      fingerprintWishValue({
        ...base,
        homeWeekday: "friday",
        hall: "halle   1",
        requestedRasterzahl: [3, 8],
        notes: "TTV Grun-Weiss",
      }),
    );
  });

  it.each([
    ["homeWeekday", { homeWeekday: "SATURDAY" }],
    ["hall", { hall: "Halle 2" }],
    ["startTime", { startTime: "20:00" }],
    ["spielwochePref", { spielwochePref: "B" }],
    ["requestedRasterzahl", { requestedRasterzahl: [4, 8] }],
    ["notes", { notes: "Other note" }],
  ] as const)("detects changed %s", (field, patch) => {
    expect(diffWishValues(base, { ...base, ...patch })).toEqual([field]);
  });
});
