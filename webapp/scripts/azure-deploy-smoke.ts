import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type SmokeStatus = "pass" | "fail";

export type SmokeTarget = {
  environment: string;
  appEndpoint: string;
  resourceGroup: string;
  appName: string;
  workerName: string;
  migrationJobName: string;
  migrationExecutionName?: string;
  timeoutSeconds: number;
  json: boolean;
};

export type SmokeCheck = {
  name: string;
  status: SmokeStatus;
  target: string;
  durationMs: number;
  message: string;
  details?: Record<string, unknown>;
};

export type SmokeReport = {
  environment: string;
  startedAt: string;
  finishedAt: string;
  status: SmokeStatus;
  checks: SmokeCheck[];
};

export type HttpResponse = {
  status: number;
  body: unknown;
};

export type HttpRunner = (
  url: string,
  timeoutMs: number,
) => Promise<HttpResponse>;

export type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (args: string[]) => Promise<CommandResult>;

export type SmokeRunners = {
  http: HttpRunner;
  command: CommandRunner;
  now?: () => Date;
};

type ParsedArgs = {
  values: Record<string, string>;
  json: boolean;
};

const DEFAULT_TIMEOUT_SECONDS = 120;
const SECRET_PATTERNS = [
  /(password|passwd|pwd|secret|token|key|connectionstring|connection_string)=([^&\s"']+)/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
];

export class SmokeConfigError extends Error {}

export function buildHealthUrl(appEndpoint: string): string {
  const url = new URL(appEndpoint);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/api/health`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_PATTERNS.reduce(
      (text, pattern) =>
        text.replace(pattern, (_match, prefix) => `${prefix}[REDACTED]`),
      value,
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|passwd|pwd|secret|token|key|connection|string/i.test(key)
          ? "[REDACTED]"
          : sanitize(item),
      ]),
    );
  }

  return value;
}

export function parseSmokeTarget(
  argv: string[],
  env: NodeJS.ProcessEnv,
): SmokeTarget {
  const parsed = parseArgs(argv);
  const read = (flag: string, envName: string) =>
    parsed.values[flag] ?? env[envName];
  const timeoutRaw =
    read("timeout-seconds", "SMOKE_TIMEOUT_SECONDS") ??
    `${DEFAULT_TIMEOUT_SECONDS}`;
  const timeoutSeconds = Number(timeoutRaw);
  const target: SmokeTarget = {
    environment: requireValue(
      read("environment", "SMOKE_ENVIRONMENT"),
      "environment",
    ),
    appEndpoint: requireValue(
      read("app-endpoint", "SMOKE_APP_ENDPOINT"),
      "app-endpoint",
    ),
    resourceGroup: requireValue(
      read("resource-group", "SMOKE_RESOURCE_GROUP"),
      "resource-group",
    ),
    appName: requireValue(read("app-name", "SMOKE_APP_NAME"), "app-name"),
    workerName: requireValue(
      read("worker-name", "SMOKE_WORKER_NAME"),
      "worker-name",
    ),
    migrationJobName: requireValue(
      read("migration-job-name", "SMOKE_MIGRATION_JOB_NAME"),
      "migration-job-name",
    ),
    migrationExecutionName: read(
      "migration-execution",
      "SMOKE_MIGRATION_EXECUTION",
    ),
    timeoutSeconds,
    json: parsed.json || env.SMOKE_JSON === "true",
  };

  if (
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0 ||
    timeoutSeconds > 1800
  ) {
    throw new SmokeConfigError("timeout-seconds must be between 1 and 1800");
  }

  try {
    const endpoint = new URL(target.appEndpoint);
    if (!["http:", "https:"].includes(endpoint.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new SmokeConfigError(
      "app-endpoint must be an absolute HTTP or HTTPS URL",
    );
  }

  return target;
}

export async function runSmoke(
  target: SmokeTarget,
  runners: SmokeRunners,
): Promise<SmokeReport> {
  const now = runners.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const checks: SmokeCheck[] = [];

  checks.push(
    await timeCheck("app-health", buildHealthUrl(target.appEndpoint), () =>
      checkAppHealth(target, runners.http),
    ),
  );
  checks.push(
    await timeCheck("migration", target.migrationJobName, () =>
      checkMigration(target, runners.command),
    ),
  );
  checks.push(
    await timeCheck("app-revision", target.appName, () =>
      checkRevision(target, target.appName, runners.command),
    ),
  );
  checks.push(
    await timeCheck("worker-revision", target.workerName, () =>
      checkRevision(target, target.workerName, runners.command),
    ),
  );

  const finishedAt = now().toISOString();
  return sanitize({
    environment: target.environment,
    startedAt,
    finishedAt,
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
  }) as SmokeReport;
}

export function renderHumanReport(report: SmokeReport): string {
  const lines = [`Azure deployment smoke: ${report.environment}`];
  for (const check of report.checks) {
    lines.push(
      `${check.status.toUpperCase()} ${check.name} ${check.target} - ${check.message}`,
    );
    if (check.status === "fail" && check.details) {
      lines.push(`  details: ${JSON.stringify(check.details)}`);
    }
  }
  lines.push(`Result: ${report.status.toUpperCase()}`);
  return lines.join("\n");
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  runners: SmokeRunners = {
    http: defaultHttpRunner,
    command: defaultCommandRunner,
  },
): Promise<number> {
  try {
    const target = parseSmokeTarget(argv, env);
    const report = await runSmoke(target, runners);
    const output = target.json
      ? JSON.stringify(report, null, 2)
      : renderHumanReport(report);
    console.log(output);
    return report.status === "pass" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Azure deployment smoke configuration failed: ${sanitize(message)}`,
    );
    return 2;
  }
}

async function checkAppHealth(
  target: SmokeTarget,
  http: HttpRunner,
): Promise<Omit<SmokeCheck, "durationMs">> {
  const url = buildHealthUrl(target.appEndpoint);
  const response = await http(url, target.timeoutSeconds * 1000);
  const body = response.body as { status?: unknown };
  if (response.status === 200 && body?.status === "ok") {
    return {
      name: "app-health",
      status: "pass",
      target: url,
      message: "Health endpoint returned ok",
    };
  }

  return {
    name: "app-health",
    status: "fail",
    target: url,
    message: `Health endpoint returned ${response.status}`,
    details: { body },
  };
}

async function checkMigration(
  target: SmokeTarget,
  command: CommandRunner,
): Promise<Omit<SmokeCheck, "durationMs">> {
  const executionName =
    target.migrationExecutionName ??
    (await latestMigrationExecution(target, command));
  const result = await command([
    "containerapp",
    "job",
    "execution",
    "show",
    "--resource-group",
    target.resourceGroup,
    "--job-name",
    target.migrationJobName,
    "--name",
    executionName,
    "--query",
    "properties.status",
    "--output",
    "tsv",
  ]);
  const status = result.stdout.trim();
  if (result.status === 0 && status === "Succeeded") {
    return {
      name: "migration",
      status: "pass",
      target: `${target.migrationJobName}/${executionName}`,
      message: "Migration execution succeeded",
    };
  }

  return {
    name: "migration",
    status: "fail",
    target: `${target.migrationJobName}/${executionName}`,
    message: status
      ? `Migration execution status is ${status}`
      : "Migration execution could not be read",
    details: { stdout: result.stdout, stderr: result.stderr },
  };
}

async function checkRevision(
  target: SmokeTarget,
  appName: string,
  command: CommandRunner,
): Promise<Omit<SmokeCheck, "durationMs">> {
  const result = await command([
    "containerapp",
    "revision",
    "list",
    "--resource-group",
    target.resourceGroup,
    "--name",
    appName,
    "--query",
    "[?properties.active==`true`]",
    "--output",
    "json",
  ]);

  if (result.status !== 0) {
    return {
      name: appName === target.appName ? "app-revision" : "worker-revision",
      status: "fail",
      target: `${appName}/active`,
      message: "Active revisions could not be read",
      details: { stderr: result.stderr },
    };
  }

  const revisions = parseJsonArray(result.stdout);
  const unhealthy = revisions.filter(
    (revision) => !isHealthyRevision(revision),
  );
  if (revisions.length > 0 && unhealthy.length === 0) {
    return {
      name: appName === target.appName ? "app-revision" : "worker-revision",
      status: "pass",
      target: `${appName}/active`,
      message: `${revisions.length} active revision(s) healthy`,
    };
  }

  return {
    name: appName === target.appName ? "app-revision" : "worker-revision",
    status: "fail",
    target: `${appName}/active`,
    message:
      revisions.length === 0
        ? "No active revisions found"
        : "One or more active revisions are unhealthy",
    details: { revisions },
  };
}

async function latestMigrationExecution(
  target: SmokeTarget,
  command: CommandRunner,
): Promise<string> {
  const result = await command([
    "containerapp",
    "job",
    "execution",
    "list",
    "--resource-group",
    target.resourceGroup,
    "--job-name",
    target.migrationJobName,
    "--query",
    "sort_by(@, &properties.startTime)[-1].name",
    "--output",
    "tsv",
  ]);
  const executionName = result.stdout.trim();
  if (result.status !== 0 || !executionName) {
    throw new SmokeConfigError(
      "No migration execution was found for the target job",
    );
  }
  return executionName;
}

async function timeCheck(
  name: string,
  target: string,
  run: () => Promise<Omit<SmokeCheck, "durationMs">>,
): Promise<SmokeCheck> {
  const started = Date.now();
  try {
    return {
      ...(await run()),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      status: "fail",
      target,
      durationMs: Date.now() - started,
      message,
    };
  }
}

async function defaultHttpRunner(
  url: string,
  timeoutMs: number,
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultCommandRunner(args: string[]): Promise<CommandResult> {
  const result = spawnSync("az", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string> = {};
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new SmokeConfigError(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new SmokeConfigError(`Missing value for ${arg}`);
    }
    values[key] = next;
    index += 1;
  }
  return { values, json };
}

function requireValue(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new SmokeConfigError(`Missing required smoke setting: ${name}`);
  }
  return value.trim();
}

function parseJsonArray(value: string): unknown[] {
  const parsed = JSON.parse(value || "[]") as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function isHealthyRevision(revision: unknown): boolean {
  if (!revision || typeof revision !== "object") {
    return false;
  }
  const properties = "properties" in revision ? revision.properties : revision;
  if (!properties || typeof properties !== "object") {
    return false;
  }
  const values = Object.values(properties as Record<string, unknown>).map(
    (value) => String(value),
  );
  return (
    values.some((value) => /running|healthy/i.test(value)) &&
    !values.some((value) => /failed|degraded|unhealthy/i.test(value))
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().then((exitCode) => {
    process.exit(exitCode);
  });
}
