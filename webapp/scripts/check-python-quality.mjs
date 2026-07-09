import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const workerDir = path.join(repoRoot, "worker");
const bypassThresholds = process.env.QUALITY_THRESHOLDS_BYPASS === "1";
const maxCyclomaticComplexity = 44;
const maxCognitiveComplexity = 46;
const mode = new Set(process.argv.slice(2));
const runLint = !mode.has("--complexity-only");
const runComplexity = !mode.has("--lint-only");

function runUv(args) {
  console.log(`> uv ${args.join(" ")}`);
  const result = spawnSync("uv", args, {
    cwd: workerDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`uv ${args.join(" ")} failed`);
  }
}

function runUvCaptured(args) {
  console.log(`> uv ${args.join(" ")}`);
  const result = spawnSync("uv", args, {
    cwd: workerDir,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exitCode = result.status ?? 1;
    throw new Error(`uv ${args.join(" ")} failed`);
  }

  return result.stdout ?? "";
}

function checkRadonCyclomaticThreshold() {
  const output = runUvCaptured(["run", "radon", "cc", "src", "-s", "-j"]);
  const report = JSON.parse(output);
  let highest = null;

  for (const [filePath, blocks] of Object.entries(report)) {
    for (const block of blocks) {
      if (!highest || block.complexity > highest.complexity) {
        highest = {
          filePath,
          name: block.name,
          line: block.lineno,
          complexity: block.complexity,
        };
      }
    }
  }

  if (!highest) {
    return;
  }

  if (highest.complexity > maxCyclomaticComplexity) {
    const message = `${highest.filePath}:${highest.line} ${highest.name} has cyclomatic complexity ${highest.complexity} (max ${maxCyclomaticComplexity})`;
    if (bypassThresholds) {
      console.warn(message);
      return;
    }

    throw new Error(message);
  }
}

if (bypassThresholds) {
  console.warn(
    "QUALITY_THRESHOLDS_BYPASS=1: complexity thresholds are running in advisory mode.",
  );
}

if (runLint) {
  runUv(["run", "ruff", "check", "src", "tests"]);
}

if (runComplexity) {
  runUv([
    "run",
    "xenon",
    "--max-absolute",
    bypassThresholds ? "F" : "F",
    "--max-modules",
    bypassThresholds ? "F" : "C",
    "--max-average",
    bypassThresholds ? "F" : "B",
    "src",
  ]);
  runUv(["run", "radon", "cc", "src", "-s", "-a"]);
  checkRadonCyclomaticThreshold();
  runUv(["run", "radon", "mi", "src", "-s"]);
  runUv([
    "run",
    "complexipy",
    "src",
    "--top",
    "10",
    "--plain",
    "--max-complexity-allowed",
    bypassThresholds ? "999" : String(maxCognitiveComplexity),
  ]);
}
