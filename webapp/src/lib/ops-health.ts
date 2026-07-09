import { getAppVersionInfo, type AppVersionInfo } from "@/lib/app-version";
import { prisma } from "@/lib/db";
import { resolveAppDatabaseUrl } from "@/lib/database-url";
import { checkDatabaseHealth, getProcessHealth } from "@/lib/monitoring";

export type HealthStatus = "healthy" | "degraded" | "unknown" | "unavailable";

export type HealthCheckKey =
  | "runtime"
  | "database"
  | "configuration"
  | "worker"
  | "deploySmoke";

export type EnvironmentIdentity = {
  environment: string;
  version: string;
  revision: string;
  buildId: string;
  builtAt: string;
};

export type HealthCheckResult = {
  key: HealthCheckKey;
  status: HealthStatus;
  summary: string;
  detail?: string;
  checkedAt?: string;
  optional?: boolean;
};

export type DiagnosticSummary = {
  generatedAt: string;
  text: string;
};

export type HealthSnapshot = {
  capturedAt: string;
  overallStatus: HealthStatus;
  environment: EnvironmentIdentity;
  checks: HealthCheckResult[];
  diagnosticSummary: DiagnosticSummary;
};

type OpsHealthEnv = Record<string, string | undefined>;

const UNKNOWN = "unknown";
const REQUIRED_CHECKS = new Set<HealthCheckKey>([
  "runtime",
  "database",
  "configuration",
]);
const SENSITIVE_KEY_PATTERN =
  /(secret|token|password|passwd|authorization|cookie|private.?key|connection.?string|database.?url|url)$/i;
const FORBIDDEN_SUMMARY_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~-]+/i,
  /postgres(?:ql)?:\/\/\S+/i,
  /mysql:\/\/\S+/i,
  /file:\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

export function createEnvironmentIdentity(
  versionInfo: AppVersionInfo = getAppVersionInfo(),
): EnvironmentIdentity {
  return {
    environment: versionInfo.environment || UNKNOWN,
    version: versionInfo.version || UNKNOWN,
    revision: versionInfo.shortRevision || versionInfo.revision || UNKNOWN,
    buildId: versionInfo.buildId || UNKNOWN,
    builtAt: versionInfo.builtAt || UNKNOWN,
  };
}

export function aggregateOverallStatus(checks: HealthCheckResult[]) {
  const requiredChecks = checks.filter((check) =>
    REQUIRED_CHECKS.has(check.key),
  );

  if (requiredChecks.some((check) => check.status === "degraded")) {
    return "degraded" as const;
  }

  if (requiredChecks.some((check) => check.status === "unknown")) {
    return "unknown" as const;
  }

  return "healthy" as const;
}

export function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? "[REDACTED]"
          : redactSensitiveValue(entry),
      ]),
    );
  }

  if (typeof value === "string") {
    return FORBIDDEN_SUMMARY_PATTERNS.reduce(
      (current, pattern) => current.replace(pattern, "[REDACTED]"),
      value,
    );
  }

  return value;
}

export function createDiagnosticSummary(
  snapshot: Omit<HealthSnapshot, "diagnosticSummary">,
): DiagnosticSummary {
  const lines = [
    `Environment: ${snapshot.environment.environment}`,
    `Version: ${snapshot.environment.version}`,
    `Revision: ${snapshot.environment.revision}`,
    `Build ID: ${snapshot.environment.buildId}`,
    `Built At: ${snapshot.environment.builtAt}`,
    `Captured At: ${snapshot.capturedAt}`,
    `Overall: ${snapshot.overallStatus}`,
    ...snapshot.checks.map((check) => `${check.key}: ${check.status}`),
  ];

  return {
    generatedAt: snapshot.capturedAt,
    text: String(redactSensitiveValue(lines.join("\n"))),
  };
}

function envPresent(env: OpsHealthEnv, names: string[]) {
  return names.some((name) => Boolean(env[name]?.trim()));
}

export function getConfigurationHealth(env: OpsHealthEnv = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const hasAuthSecret = envPresent(env, [
    "BETTERAUTH_SECRET",
    "BETTER_AUTH_SECRET",
  ]);
  const hasDatabaseUrl = envPresent(env, ["APP_DATABASE_URL", "DATABASE_URL"]);
  const hasRuntimeEnvironment = envPresent(env, ["APP_ENVIRONMENT"]);
  const hasBuildMetadata = envPresent(env, [
    "APP_VERSION",
    "APP_REVISION",
    "APP_GIT_SHA",
    "APP_BUILD_ID",
    "APP_BUILT_AT",
  ]);
  const missingRequired = [
    isProduction && !hasAuthSecret ? "authentication secret" : null,
    !hasDatabaseUrl ? "app database URL" : null,
  ].filter(Boolean);
  const optionalMissing = [
    !hasRuntimeEnvironment ? "runtime environment label" : null,
    !hasBuildMetadata ? "build metadata" : null,
  ].filter(Boolean);

  if (missingRequired.length > 0) {
    return {
      key: "configuration" as const,
      status: "degraded" as const,
      summary: "Required runtime configuration is missing",
      detail: `Missing required configuration: ${missingRequired.join(", ")}.`,
      checkedAt: new Date().toISOString(),
    };
  }

  if (optionalMissing.length > 0) {
    return {
      key: "configuration" as const,
      status: "unknown" as const,
      summary: "Runtime configuration is usable with incomplete metadata",
      detail: `Missing optional metadata: ${optionalMissing.join(", ")}.`,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    key: "configuration" as const,
    status: "healthy" as const,
    summary: "Required runtime configuration is present",
    checkedAt: new Date().toISOString(),
  };
}

function mapRuntimeHealth(capturedAt: string): HealthCheckResult {
  const runtime = getProcessHealth();
  return {
    key: "runtime",
    status: runtime.status === "ok" ? "healthy" : "degraded",
    summary:
      runtime.status === "ok"
        ? "Runtime is responding"
        : "Runtime health check is degraded",
    detail: `Node environment: ${runtime.nodeEnv}; uptime: ${runtime.uptimeSeconds}s.`,
    checkedAt: capturedAt,
  };
}

async function mapDatabaseHealth(
  capturedAt: string,
): Promise<HealthCheckResult> {
  const database = await checkDatabaseHealth();
  return {
    key: "database",
    status: database.status === "ok" ? "healthy" : "degraded",
    summary:
      database.status === "ok"
        ? "Database connectivity check passed"
        : "Database connectivity check failed",
    detail:
      database.status === "ok"
        ? `Provider: ${resolveAppDatabaseUrl().startsWith("file:") ? "sqlite" : "postgresql"}.`
        : database.message,
    checkedAt: capturedAt,
  };
}

async function getWorkerHealth(capturedAt: string): Promise<HealthCheckResult> {
  const recentJob = await prisma.backgroundJob.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      status: true,
      updatedAt: true,
      workerId: true,
      error: true,
    },
  });

  if (!recentJob) {
    return {
      key: "worker",
      status: "unknown",
      summary: "No recent worker evidence is available",
      optional: true,
    };
  }

  const checkedAt = recentJob.updatedAt.toISOString();
  if (recentJob.status === "FAILED") {
    return {
      key: "worker",
      status: "degraded",
      summary: "Recent worker job failed",
      detail: String(
        redactSensitiveValue(recentJob.error ?? "Review background jobs."),
      ),
      checkedAt,
      optional: true,
    };
  }

  return {
    key: "worker",
    status: "healthy",
    summary: `Recent worker evidence: ${recentJob.status.toLowerCase()}`,
    detail: recentJob.workerId ? `Worker: ${recentJob.workerId}.` : undefined,
    checkedAt,
    optional: true,
  };
}

function getDeploySmokeHealth(): HealthCheckResult {
  return {
    key: "deploySmoke",
    status: "unavailable",
    summary: "No recent deployment smoke result is available",
    optional: true,
  };
}

export async function buildOpsHealthSnapshot(): Promise<HealthSnapshot> {
  const capturedAt = new Date().toISOString();
  const checks = [
    mapRuntimeHealth(capturedAt),
    await mapDatabaseHealth(capturedAt),
    getConfigurationHealth(),
    await getWorkerHealth(capturedAt),
    getDeploySmokeHealth(),
  ];
  const snapshotWithoutSummary = {
    capturedAt,
    overallStatus: aggregateOverallStatus(checks),
    environment: createEnvironmentIdentity(),
    checks,
  };

  return {
    ...snapshotWithoutSummary,
    diagnosticSummary: createDiagnosticSummary(snapshotWithoutSummary),
  };
}
