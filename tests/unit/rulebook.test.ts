import { describe, expect, it } from "vitest";
import {
  derbySpieltag,
  loadTemplate,
  rasterSizeForGroupSize,
  relation
} from "../../src/raster/rulebook/index.js";
import { deriveHomeWeeks } from "../../src/raster/score/index.js";

describe("raster rulebook", () => {
  it("matches the verified 12er reference homes", () => {
    expect(deriveHomeWeeks(6, 1).weeks).toEqual([1, 2, 6, 15, 19]);
    expect(deriveHomeWeeks(6, 1, "double").weeks).toEqual([1, 2, 6, 15, 19]);
    expect(loadTemplate(6).matchdays).toHaveLength(5);
    expect(loadTemplate("6d").matchdays).toHaveLength(10);
    expect(deriveHomeWeeks(8, 1).weeks).toEqual([1, 2, 4, 6, 15, 17, 19]);
    expect(deriveHomeWeeks(10, 1).weeks).toEqual([
      1, 2, 4, 6, 8, 13, 15, 17, 19
    ]);
    expect(deriveHomeWeeks(12, 1).weeks).toEqual([
      1, 2, 4, 6, 8, 10, 13, 15, 17, 19, 21
    ]);
    expect(deriveHomeWeeks(12, 6).weeks).toEqual([
      1, 3, 5, 7, 9, 11, 13, 14, 18, 20
    ]);
    expect(deriveHomeWeeks(12, 12).weeks).toEqual([
      2, 4, 6, 8, 10, 11, 13, 15, 19, 20
    ]);
  });

  it("reproduces known 12er wechsel and gemeinsam pairs", () => {
    expect(relation(12, 6, 12, 12)).toBe("wechsel");
    expect(relation(12, 1, 12, 7)).toBe("wechsel");
    expect(relation(12, 6, 12, 7)).toBe("zeitgleich");
    expect(relation(12, 1, 10, 6)).toBe("wechsel");
    expect(derbySpieltag(12, 6, 7)).toBe(1);
    expect(derbySpieltag(12, 1, 12)).toBe(1);
    expect(derbySpieltag("6d", 1, 6)).toBe(1);
    expect(derbySpieltag("6d", 1, 5)).toBe(5);
  });

  it("handles odd-size byes by dropping games against the top raster number", () => {
    expect(deriveHomeWeeks(7, 8).weeks).toEqual([]);
    expect(deriveHomeWeeks(11, 12).weeks).toEqual([]);
    expect(deriveHomeWeeks(11, 1).weeks).not.toContain(1);
  });

  it("rejects 13er and 14er groups until they are explicitly modeled", () => {
    expect(() => rasterSizeForGroupSize(13)).toThrow("5..12");
    expect(() => rasterSizeForGroupSize(14)).toThrow("5..12");
  });
});
