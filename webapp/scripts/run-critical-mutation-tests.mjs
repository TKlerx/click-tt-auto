import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const testFiles = ["tests/unit/cli-release-service.test.ts"];

const mutants = [
  {
    name: "CLI release lookup accepts wrong artifact prefix",
    file: "src/services/api/cli-release-service.ts",
    from: 'entry.startsWith("starterctl_")',
    to: 'entry.startsWith("projectboard_")',
  },
  {
    name: "CLI release lookup selects oldest matching artifact",
    file: "src/services/api/cli-release-service.ts",
    from: ".sort()\n      .at(-1)",
    to: ".sort()\n      .at(0)",
  },
  {
    name: "Linux x64 archive extension changes to zip",
    file: "src/services/api/cli-release-service.ts",
    from: 'target: "linux-amd64",\n    label: "Linux x64",\n    goos: "linux",\n    arch: "amd64",\n    extension: "tar.gz",',
    to: 'target: "linux-amd64",\n    label: "Linux x64",\n    goos: "linux",\n    arch: "amd64",\n    extension: "zip",',
  },
];

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runVitest(files, quiet = false) {
  const result = spawnSync(pnpm, ["exec", "vitest", "run", ...files], {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function replaceOnce(source, from, to, name) {
  const first = source.indexOf(from);
  if (first === -1 || source.indexOf(from, first + from.length) !== -1) {
    throw new Error(`Mutant "${name}" expected exactly one match.`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

console.log("Baseline critical tests");
if (runVitest(testFiles).status !== 0) {
  process.exit(1);
}

const survivors = [];

for (const mutant of mutants) {
  const original = readFileSync(mutant.file, "utf8");
  try {
    writeFileSync(
      mutant.file,
      replaceOnce(original, mutant.from, mutant.to, mutant.name),
    );
    console.log(`\nMutant: ${mutant.name}`);
    const { status, output } = runVitest(testFiles, true);
    if (status === 0) {
      survivors.push(mutant.name);
      console.error(`Survived: ${mutant.name}`);
      console.error(output);
    } else {
      console.log(`Killed: ${mutant.name}`);
    }
  } finally {
    writeFileSync(mutant.file, original);
  }
}

if (survivors.length > 0) {
  console.error(
    `\nMutation survivors:\n${survivors.map((name) => `- ${name}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("\nAll critical mutants killed.");
