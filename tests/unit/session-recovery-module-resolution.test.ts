import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// Vitest/tsx substitute .ts for missing .js files; the production source
// bundler needs a real .js entry, as with the existing auth.js facade.
const sourceRoot = new URL("../../src/", import.meta.url);

describe("shared session recovery source resolution", () => {
  for (const entry of ["auth.ts", "navigation.ts", "index.ts"]) {
    it(`resolves the recovery import from ${entry} without TypeScript extension substitution`, () => {
      const sourceFile = new URL(entry, sourceRoot);
      const source = readFileSync(sourceFile, "utf8");
      const recoveryImports = ts.preProcessFile(source).importedFiles
        .map(({ fileName }) => fileName)
        .filter((specifier) => specifier.includes("session-recovery"));

      expect(recoveryImports).toEqual(["./session-recovery.js"]);
      const requireFromSource = createRequire(sourceFile);
      const resolved = requireFromSource.resolve(recoveryImports[0]!);
      expect(resolved).toBe(fileURLToPath(new URL("session-recovery.js", sourceRoot)));
    });
  }

  it("preserves emitted Node ESM imports and recovery error identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "session-recovery-esm-"));
    try {
      writeFileSync(join(directory, "package.json"), '{"type":"module"}');
      for (const entry of ["auth", "session-recovery"]) {
        const source = readFileSync(new URL(`${entry}.ts`, sourceRoot), "utf8");
        const emitted = ts.transpileModule(source, {
          // .mts supplies the ESM format that the root package's type:module
          // supplies to a full NodeNext compilation (transpileModule is isolated).
          fileName: `${entry}.mts`,
          compilerOptions: { module: ts.ModuleKind.NodeNext, target: ts.ScriptTarget.ES2022 }
        }).outputText;
        writeFileSync(join(directory, `${entry}.js`), emitted);
      }
      const smoke = `
        import assert from 'node:assert/strict';
        import { ensureSessionActive } from './auth.js';
        import { SessionExpiredError, isSessionExpiredError } from './session-recovery.js';
        const locator = { first() { return this; }, async isVisible() { return true; } };
        await assert.rejects(ensureSessionActive({ locator() { return locator; } }), error =>
          error instanceof SessionExpiredError && isSessionExpiredError(error));
      `;
      // Plain Node, not Vitest/tsx: no extension substitution or TS loader.
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", smoke], {
        cwd: directory, encoding: "utf8", timeout: 10_000,
        env: { ...process.env, NODE_OPTIONS: "" }
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
