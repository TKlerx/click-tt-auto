import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type LoggingGuardModule = {
  scanLoggingGuard(options?: {
    root?: string;
    files?: string[];
  }): Array<{ path: string; line: number; remediation: string }>;
};

const tempRoots: string[] = [];
const loggingGuardScript = "../../scripts/check-logging-guard.mjs";

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "logging-guard-"));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

describe("logging guard", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags production console calls while allowing logger, scripts, and tests", async () => {
    const { scanLoggingGuard } = (await import(
      loggingGuardScript
    )) as LoggingGuardModule;
    const root = makeTempRoot();
    writeFile(root, "src/services/example.ts", "console.error('bad');\n");
    writeFile(root, "src/lib/logger.ts", "console.error('sink');\n");
    writeFile(root, "scripts/example.mjs", "console.error('cli');\n");
    writeFile(root, "tests/unit/example.test.ts", "console.error('test');\n");

    const findings = scanLoggingGuard({ root });

    expect(findings).toEqual([
      expect.objectContaining({
        path: "src/services/example.ts",
        line: 1,
      }),
    ]);
  });

  it("flags worker direct output and unstructured stdlib logger calls", async () => {
    const { scanLoggingGuard } = (await import(
      loggingGuardScript
    )) as LoggingGuardModule;
    const root = makeTempRoot();
    writeFile(root, "worker/src/starter_worker/main.py", "print('bad')\n");
    writeFile(
      root,
      "worker/src/starter_worker/other.py",
      "logger.info('job.completed id=%s', job_id)\n",
    );
    writeFile(
      root,
      "worker/src/starter_worker/logging.py",
      "logger.info('json sink')\n",
    );

    const findings = scanLoggingGuard({ root });

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.path)).toEqual([
      "worker/src/starter_worker/main.py",
      "worker/src/starter_worker/other.py",
    ]);
  });
});
