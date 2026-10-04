import { execFileSync } from "node:child_process";
import { cpSync, globSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import nextConfig from "../../next.config";

const require = createRequire(import.meta.url);
const playwrightRequire = createRequire(require.resolve("playwright"));
const coreRoot = dirname(
  playwrightRequire.resolve("playwright-core/package.json"),
);
const webappRoot = resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone tracing includes the browser registry required to import Playwright", () => {
  const standalone = mkdtempSync(join(tmpdir(), "standalone-playwright-"));
  temporaryDirectories.push(standalone);
  const target = join(standalone, "playwright-core");

  // Reproduce CI's traced package: its JavaScript is present, but the dynamically
  // required browsers.json is missing. Never use the installed package as a
  // fallback: the subprocess must load this isolated standalone copy.
  cpSync(coreRoot, target, {
    recursive: true,
    filter: (source) => source !== join(coreRoot, "browsers.json"),
  });

  const patterns = nextConfig.outputFileTracingIncludes?.["/*"] ?? [];
  const includedFiles = globSync(patterns, { cwd: webappRoot }).map((file) =>
    resolve(webappRoot, file),
  );
  const registry = join(coreRoot, "browsers.json");
  if (includedFiles.includes(registry)) {
    cpSync(registry, join(target, "browsers.json"));
  }

  const output = execFileSync(
    process.execPath,
    [
      "-e",
      "const {chromium} = require(process.argv[1]); console.log(chromium.name());",
      target,
    ],
    { encoding: "utf8" },
  );
  expect(output.trim()).toBe("chromium");
});
