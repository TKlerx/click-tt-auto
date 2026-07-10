import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SWAGGER_COMPONENT_PATH = path.resolve(
  process.cwd(),
  "src/components/docs/swagger-ui.tsx",
);

describe("api docs asset fixtures", () => {
  it("uses local vendored swagger assets instead of remote CDN URLs", () => {
    const source = fs.readFileSync(SWAGGER_COMPONENT_PATH, "utf8");

    expect(source).toContain("/vendor/swagger-ui/swagger-ui-bundle.js");
    expect(source).toContain("/vendor/swagger-ui/swagger-ui.css");
    expect(source).not.toContain("unpkg.com/swagger-ui-dist");
  });
});
