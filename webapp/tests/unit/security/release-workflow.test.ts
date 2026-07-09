import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  ".github/workflows/cli-release.yml",
);

describe("release workflow fixtures", () => {
  it("includes immutable action references", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
    );
    expect(workflow).toContain(
      "actions/setup-go@d35c59abb061a4a6fb18e82ac0862c26744d6ab5",
    );
    expect(workflow).toContain(
      "goreleaser/goreleaser-action@9c156ee8a17a598857849441385a2041ef570552",
    );
  });

  it("splits validation and publish permissions with pinned release version", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("validate:");
    expect(workflow).toContain("publish:");
    expect(workflow).toContain("needs: validate");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("version: v2.16.0");
  });
});
