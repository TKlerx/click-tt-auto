import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

describe("combined raster upper-league constraints", () => {
  it("does not inherit fixed Rasterzahlen from separate scope models", () => {
    const workerDir = path.resolve(__dirname, "../../worker");
    const result = spawnSync(
      "uv",
      [
        "run",
        "python",
        "-m",
        "unittest",
        "tests.test_main.WorkerTests.test_combined_raster_model_prefixes_scopes_and_drops_inherited_fixed_numbers",
      ],
      { cwd: workerDir, encoding: "utf8" },
    );

    expect(result.stderr + result.stdout).toContain("OK");
    expect(result.status).toBe(0);
  });
});
