import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { computeExitCode } = require("../../../scripts/prisma-run-lib.js") as {
  computeExitCode: (result: { status: number | null; error?: Error }) => number;
};

describe("computeExitCode", () => {
  it("returns child status when present", () => {
    expect(computeExitCode({ status: 2 })).toBe(2);
  });

  it("returns non-zero when spawn fails to launch", () => {
    expect(
      computeExitCode({
        status: null,
        error: new Error("spawn pnpm ENOENT"),
      }),
    ).toBe(1);
  });
});
