import { describe, expect, it, vi } from "vitest";
import {
  buildHealthUrl,
  parseSmokeTarget,
  renderHumanReport,
  runSmoke,
  sanitize,
  SmokeConfigError,
  type CommandRunner,
  type HttpRunner,
  type SmokeTarget,
} from "../../scripts/azure-deploy-smoke";

const healthyRevision = JSON.stringify([
  {
    name: "revision-a",
    properties: {
      active: true,
      healthState: "Healthy",
      runningState: "Running",
    },
  },
]);

function target(overrides: Partial<SmokeTarget> = {}): SmokeTarget {
  return {
    environment: "dev",
    appEndpoint: "https://example.test/starter",
    resourceGroup: "rg-dev",
    appName: "app-dev",
    workerName: "worker-dev",
    migrationJobName: "migration-dev",
    migrationExecutionName: "migration-execution",
    timeoutSeconds: 120,
    json: false,
    ...overrides,
  };
}

function commandRunner(
  overrides: Record<
    string,
    { status?: number; stdout?: string; stderr?: string }
  > = {},
): CommandRunner {
  return vi.fn(async (args: string[]) => {
    const joined = args.join(" ");
    const match = Object.entries(overrides).find(([key]) =>
      joined.includes(key),
    );
    const response = match?.[1] ?? {};
    if (joined.includes("execution show")) {
      return {
        status: response.status ?? 0,
        stdout: response.stdout ?? "Succeeded\n",
        stderr: response.stderr ?? "",
      };
    }
    return {
      status: response.status ?? 0,
      stdout: response.stdout ?? healthyRevision,
      stderr: response.stderr ?? "",
    };
  });
}

describe("azure deploy smoke", () => {
  it("builds the app health URL with the configured base path", () => {
    expect(buildHealthUrl("https://example.test/starter/")).toBe(
      "https://example.test/starter/api/health",
    );
  });

  it("requires valid smoke configuration", () => {
    expect(() => parseSmokeTarget([], process.env)).toThrow(SmokeConfigError);
    expect(() =>
      parseSmokeTarget(
        [
          "--environment",
          "dev",
          "--app-endpoint",
          "ftp://example.test",
          "--resource-group",
          "rg",
          "--app-name",
          "app",
          "--worker-name",
          "worker",
          "--migration-job-name",
          "migration",
        ],
        process.env,
      ),
    ).toThrow("app-endpoint must be an absolute HTTP or HTTPS URL");
  });

  it("passes when the app health endpoint and runtime checks are healthy", async () => {
    const http: HttpRunner = vi.fn(async () => ({
      status: 200,
      body: { status: "ok" },
    }));

    const report = await runSmoke(target(), {
      http,
      command: commandRunner(),
    });

    expect(report.status).toBe("pass");
    expect(report.checks.map((check) => [check.name, check.status])).toEqual([
      ["app-health", "pass"],
      ["migration", "pass"],
      ["app-revision", "pass"],
      ["worker-revision", "pass"],
    ]);
    expect(http).toHaveBeenCalledWith(
      "https://example.test/starter/api/health",
      120000,
    );
  });

  it("fails the app health check when the endpoint is degraded", async () => {
    const http: HttpRunner = vi.fn(async () => ({
      status: 503,
      body: { status: "degraded" },
    }));

    const report = await runSmoke(target(), {
      http,
      command: commandRunner(),
    });

    expect(report.status).toBe("fail");
    expect(report.checks[0]).toMatchObject({
      name: "app-health",
      status: "fail",
      message: "Health endpoint returned 503",
    });
  });

  it("looks up the latest migration execution when one is not supplied", async () => {
    const command = commandRunner({
      "execution list": { stdout: "latest-execution\n" },
    });

    const report = await runSmoke(
      target({ migrationExecutionName: undefined }),
      {
        http: async () => ({ status: 200, body: { status: "ok" } }),
        command,
      },
    );

    expect(report.status).toBe("pass");
    expect(command).toHaveBeenCalledWith(
      expect.arrayContaining(["execution", "list"]),
    );
    expect(command).toHaveBeenCalledWith(
      expect.arrayContaining(["latest-execution"]),
    );
  });

  it("fails when the migration execution did not succeed", async () => {
    const report = await runSmoke(target(), {
      http: async () => ({ status: 200, body: { status: "ok" } }),
      command: commandRunner({
        "execution show": { stdout: "Failed\n" },
      }),
    });

    expect(report.status).toBe("fail");
    expect(
      report.checks.find((check) => check.name === "migration"),
    ).toMatchObject({
      status: "fail",
      message: "Migration execution status is Failed",
    });
  });

  it("fails when an active revision is unhealthy", async () => {
    const report = await runSmoke(target(), {
      http: async () => ({ status: 200, body: { status: "ok" } }),
      command: commandRunner({
        "revision list --resource-group rg-dev --name worker-dev": {
          stdout: JSON.stringify([
            {
              properties: {
                active: true,
                healthState: "Unhealthy",
                runningState: "Failed",
              },
            },
          ]),
        },
      }),
    });

    expect(report.status).toBe("fail");
    expect(
      report.checks.find((check) => check.name === "worker-revision"),
    ).toMatchObject({
      status: "fail",
      message: "One or more active revisions are unhealthy",
    });
  });

  it("redacts sensitive values in reports", () => {
    const sanitized = sanitize({
      token: "abc123",
      url: "https://example.test?token=abc123&name=value",
      message: "Bearer abc.def.ghi",
    });

    expect(JSON.stringify(sanitized)).not.toContain("abc123");
    expect(JSON.stringify(sanitized)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(sanitized)).toContain("[REDACTED]");
  });

  it("renders concise human output", async () => {
    const report = await runSmoke(target(), {
      http: async () => ({ status: 200, body: { status: "ok" } }),
      command: commandRunner(),
    });

    expect(renderHumanReport(report)).toContain("Azure deployment smoke: dev");
    expect(renderHumanReport(report)).toContain("PASS app-health");
    expect(renderHumanReport(report)).toContain("Result: PASS");
  });
});
