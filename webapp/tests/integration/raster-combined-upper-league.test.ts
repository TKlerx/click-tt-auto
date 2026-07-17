import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const combinedModelTests = [
  // FR-013: the run decides the upper-league numbers rather than inheriting them.
  "test_combined_raster_model_unfixes_inherited_but_keeps_pins",
  // FR-014: numbers supplied for the combined set stay hard constraints.
  "test_combined_raster_model_honours_numbers_supplied_for_the_combined_set",
  // The merge must leave wishes and shared clubs resolvable across scopes.
  "test_combined_raster_model_keeps_ids_so_wishes_and_clubs_still_resolve",
  "test_combined_raster_model_keeps_every_venue_of_a_shared_club",
  "test_combined_raster_model_tags_groups_with_scope_to_keep_them_distinct",
];

describe("combined raster upper-league constraints", () => {
  it("builds the combined solver model to spec", () => {
    const workerDir = path.resolve(__dirname, "../../worker");
    const result = spawnSync(
      "uv",
      [
        "run",
        "python",
        "-m",
        "unittest",
        ...combinedModelTests.map(
          (name) => `tests.test_main.WorkerTests.${name}`,
        ),
      ],
      { cwd: workerDir, encoding: "utf8" },
    );

    expect(result.stderr + result.stdout).toContain("OK");
    expect(result.status).toBe(0);
  });
});
