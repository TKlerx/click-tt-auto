import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function createInfraPlanJson(varFile = "environments/dev.tfvars") {
  const tempDir = mkdtempSync(join(tmpdir(), "webapp-template-infra-plan-"));
  const workDir = join(tempDir, "azure");
  const planPath = join(tempDir, "tfplan");
  const tofuEnv = { ...process.env };

  try {
    cpSync("infra/azure", workDir, { recursive: true });
    const terraformDir = join(workDir, ".terraform");
    if (existsSync(terraformDir)) {
      rmSync(terraformDir, { recursive: true, force: true });
    }

    const backendPath = join(workDir, "backend.tf");
    if (existsSync(backendPath)) {
      rmSync(backendPath);
    }

    runTofu(
      [
        `-chdir=${workDir}`,
        "init",
        "-backend=false",
        "-input=false",
        "-reconfigure",
      ],
      tofuEnv,
      "inherit",
    );
    runTofu(
      [
        `-chdir=${workDir}`,
        "plan",
        "-refresh=false",
        "-input=false",
        `-var-file=${varFile}`,
        `-out=${planPath}`,
      ],
      tofuEnv,
      "inherit",
    );

    return runTofuJson(
      [`-chdir=${workDir}`, "show", "-json", planPath],
      tofuEnv,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runTofu(args, env, stdio) {
  const result = spawnSync("tofu", args, {
    encoding: "utf8",
    env,
    stdio,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runTofuJson(args, env) {
  const result = spawnSync("tofu", args, { encoding: "utf8", env });
  if ((result.status ?? 1) !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}
