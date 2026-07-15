import { describe, expect, it } from "vitest";
import {
  capacityCsvRowSchema,
  fixedRasterzahlSchema,
  runSettingsSchema,
  wishJsonSchema,
} from "@/lib/raster/schemas";

describe("raster input schemas", () => {
  it("accepts a complete wish row", () => {
    expect(
      wishJsonSchema.parse({
        clubId: "elsen",
        clubName: "TuRa Elsen",
        teamLabel: "TuRa Elsen II",
        homeWeekday: "FRIDAY",
        hall: "1",
        requestedRasterzahl: "7",
      }),
    ).toMatchObject({
      clubId: "elsen",
      homeWeekday: "FRIDAY",
      requestedRasterzahl: 7,
    });
  });

  it("rejects incomplete wishes", () => {
    expect(() =>
      wishJsonSchema.parse({ clubId: "elsen", homeWeekday: "FRIDAY" }),
    ).toThrow();
  });

  it("coerces capacity, fixed Rasterzahl, and run settings", () => {
    expect(
      capacityCsvRowSchema.parse({
        scope: "OWL",
        clubId: "elsen",
        hall: "1",
        weekday: "FRIDAY",
        capacity: "2",
      }).capacity,
    ).toBe(2);
    expect(
      fixedRasterzahlSchema.parse({
        clubId: "elsen",
        teamLabel: "I",
        rasterzahl: "4",
        source: "PDF",
      }).rasterzahl,
    ).toBe(4);
    expect(runSettingsSchema.parse({}).timeLimitSeconds).toBe(60);
  });
});
