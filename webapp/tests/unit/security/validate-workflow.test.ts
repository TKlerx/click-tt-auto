import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  ".github/workflows/validate.yml",
);

describe("validate workflow fixtures", () => {
  it("pins actions to immutable commit SHAs", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
    );
    expect(workflow).toContain(
      "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
    );
    expect(workflow).toContain(
      "actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405",
    );
    expect(workflow).toContain(
      "astral-sh/setup-uv@08807647e7069bb48b6ef5acd8ec9567f424441b",
    );
  });

  it("does not install uv via remote shell script", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).not.toContain("astral.sh/uv/install.sh");
    expect(workflow).not.toContain("curl -LsSf");
  });
});
