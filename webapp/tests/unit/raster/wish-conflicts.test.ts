import { describe, expect, it } from "vitest";
import { partitionConflicts } from "@/lib/raster/wish-conflicts";

describe("wish conflict partitioning", () => {
  const conflicts = [
    { id: "manual", wish: { origin: "MANUAL" } },
    { id: "imported", wish: { origin: "IMPORTED" } },
  ];

  it("separates an import undoing an edit from a moved source value", () => {
    const { overwrites, sourceChanged } = partitionConflicts(conflicts);

    expect(overwrites.map((conflict) => conflict.id)).toEqual(["manual"]);
    expect(sourceChanged.map((conflict) => conflict.id)).toEqual(["imported"]);
  });

  it("keeps every conflict in exactly one side", () => {
    const { overwrites, sourceChanged } = partitionConflicts(conflicts);

    expect(overwrites.length + sourceChanged.length).toBe(conflicts.length);
  });
});
