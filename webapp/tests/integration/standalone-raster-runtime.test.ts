import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const webappRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(webappRoot, "..");
const temporaryDirectories: string[] = [];
const rosterBytes = Buffer.from(
  "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr\n" +
    "OWL;2026/27;Bezirksliga;1;42522;TTV Grün-Weiß Daseburg;Erwachsene;1\n",
);
const rosterOperation = `rasterIngest.parseRosterCsvBytes(Buffer.from(${JSON.stringify([...rosterBytes])}))`;
const rosterResult = {
  charset: "utf-8",
  rows: [{ vereinNr: "42522", vereinName: "TTV Grün-Weiß Daseburg" }],
};

// Integration regressions: repository-backed standalone startup must keep the
// raster source tree, ESM package context, rulebook JSON and dependencies together
// after Next's generated server changes cwd into .next/standalone/webapp.
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function prepareRuntime(root: string) {
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(join(repoRoot, "src/raster"), join(root, "src/raster"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "standalone-raster-fixture",
      private: true,
      type: "module",
    }),
  );
  // Do not auto-install anything in this intentionally minimal runtime fixture.
  // The real pnpm/tsx command uses only existing executables and dependencies.
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    "verifyDepsBeforeRun: false\n",
  );
  mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
  symlinkSync(
    join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs"),
    join(root, "node_modules/.bin/tsx"),
  );
  if (process.platform === "win32") {
    writeFileSync(
      join(root, "node_modules/.bin/tsx.cmd"),
      `@echo off\r\n"${process.execPath}" "${join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs")}" %*\r\n`,
    );
  }
  symlinkSync(
    dirname(require.resolve("pdfjs-dist/package.json")),
    join(root, "node_modules/pdfjs-dist"),
  );
}

function runStandalone(operation: string, override = false): unknown {
  const fixture = mkdtempSync(join(tmpdir(), "standalone-raster-runtime-"));
  temporaryDirectories.push(fixture);
  const app = join(fixture, "webapp");
  const standaloneRoot = join(app, ".next/standalone");
  const serverDirectory = join(standaloneRoot, "webapp");
  mkdirSync(serverDirectory, { recursive: true });
  const runtimeRoot = override ? join(fixture, "custom-runtime") : fixture;
  prepareRuntime(runtimeRoot);
  writeFileSync(
    join(standaloneRoot, "pnpm-workspace.yaml"),
    "verifyDepsBeforeRun: false\n",
  );
  writeFileSync(join(serverDirectory, "package.json"), '{"type":"commonjs"}');
  // Exercise the actual launcher and pipeline, not a mocked child_process call.
  // Only the HTTP server is replaced; its cwd transition matches Next's emitted
  // standalone server. No browser, database, build or network is required.
  writeFileSync(
    join(serverDirectory, "server.js"),
    `process.chdir(__dirname);
console.log("__CWD__" + process.cwd(), "__ROOT__" + process.env.RASTER_REPO_ROOT);
const { require: tsRequire } = require(${JSON.stringify(require.resolve("tsx/cjs/api"))});
const { rasterIngest } = tsRequire(${JSON.stringify(join(webappRoot, "src/lib/raster/pipeline.ts"))}, __filename);
${operation}.then(result => {
  console.log("__RESULT__" + JSON.stringify(result));
}).catch(error => {
  console.error(error.message, error.stdout, error.stderr);
  process.exitCode = 1;
});
`,
  );
  const env = { ...process.env };
  if (process.platform === "win32") {
    // The Windows launcher uses next start instead of the standalone entrypoint.
    // Replace only that HTTP entrypoint, with the same fixture server as Linux.
    const nextBin = join(app, "node_modules/next/dist/bin");
    mkdirSync(nextBin, { recursive: true });
    writeFileSync(
      join(nextBin, "next"),
      `require(${JSON.stringify(join(serverDirectory, "server.js"))});`,
    );
  }
  delete env.RASTER_REPO_ROOT;
  if (override) env.RASTER_REPO_ROOT = runtimeRoot;
  const result = spawnSync(
    process.execPath,
    [join(webappRoot, "scripts/run-next.mjs"), "start"],
    { cwd: app, env, encoding: "utf8", timeout: 25_000 },
  );
  expect(
    result.status,
    `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
  ).toBe(0);
  expect(result.stdout).toContain(`__CWD__${serverDirectory}`);
  expect(result.stdout).toContain(`__ROOT__${runtimeRoot}`);
  const line = result.stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("__RESULT__"));
  expect(line).toBeDefined();
  return JSON.parse(line!.slice("__RESULT__".length));
}

test("standalone startup parses roster bytes with the repository raster runtime", () => {
  expect(runStandalone(rosterOperation)).toMatchObject(rosterResult);
});

test("standalone startup scores assignments with the repository rulebook resources", () => {
  const model = {
    clubs: [{ id: "elsen", name: "TuRa Elsen", venues: [] }],
    teams: [
      {
        id: "elsen-1",
        clubId: "elsen",
        label: "I",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 3 },
        confidence: "ok",
      },
    ],
    groups: [
      { ref: { league: "L", name: "G6" }, size: 6, teamIds: ["elsen-1"] },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
  expect(
    runStandalone(
      `rasterIngest.scoreAssignment(${JSON.stringify(model)}, {"elsen-1": 4})`,
    ),
  ).toMatchObject({
    assignment: { "elsen-1": 3 },
    objective: 0,
    hardViolations: [],
  });
});

test("standalone startup parses all 31 upper leagues with the repository PDF dependency", () => {
  const fixture = join(
    repoRoot,
    "tests/fixtures/raster/gruppen-und-raster-2026.pdf",
  );
  const parsed = runStandalone(
    `rasterIngest.parseUpperLeagueRasterPdf(${JSON.stringify(fixture)})`,
  ) as { leagues: Array<{ league: string; entries: Array<{ team: string }> }> };
  expect(parsed.leagues).toHaveLength(31);
  expect(parsed.leagues).toContainEqual(
    expect.objectContaining({ league: "Verbandsliga 1 Erwachsene" }),
  );
  expect(parsed.leagues.flatMap((league) => league.entries)).toContainEqual(
    expect.objectContaining({ team: expect.stringContaining("TuRa Elsen") }),
  );
});

test("standalone startup preserves an explicit raster runtime root", () => {
  expect(runStandalone(rosterOperation, true)).toMatchObject(rosterResult);
});
