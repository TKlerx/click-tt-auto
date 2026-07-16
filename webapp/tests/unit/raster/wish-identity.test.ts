import { describe, expect, it } from "vitest";
import { findMatchingWish } from "@/lib/raster/wish-identity";

describe("wish import identity pairing", () => {
  const wishes = [
    { id: "wish-1", clubId: "42706", teamLabel: "Erwachsene II" },
    { id: "wish-2", clubId: "42522", teamLabel: null },
  ];

  it("resolves an exact club and team pair", () => {
    expect(
      findMatchingWish(
        { clubId: "42706", teamLabel: " Erwachsene   II " },
        wishes,
      )?.id,
    ).toBe("wish-1");
  });

  it("returns unmatched rather than inventing a wish", () => {
    expect(
      findMatchingWish({ clubId: "99999", teamLabel: "Erwachsene" }, wishes),
    ).toBeNull();
  });
});
