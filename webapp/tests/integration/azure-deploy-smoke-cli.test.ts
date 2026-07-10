import { afterEach, describe, expect, it, vi } from "vitest";
import {
  main,
  type CommandRunner,
  type HttpRunner,
} from "../../scripts/azure-deploy-smoke";

const healthyRevision = JSON.stringify([
  {
    properties: {
      active: true,
      healthState: "Healthy",
      runningState: "Running",
    },
  },
]);

const baseArgs = [
  "--environment",
  "dev",
  "--app-endpoint",
  "https://example.test/starter",
  "--resource-group",
  "rg-dev",
  "--app-name",
  "app-dev",
  "--worker-name",
  "worker-dev",
  "--migration-job-name",
  "migration-dev",
  "--migration-execution",
  "migration-execution",
];

function healthyRunners(): { http: HttpRunner; command: CommandRunner } {
  return {
    http: vi.fn(async () => ({ status: 200, body: { status: "ok" } })),
    command: vi.fn(async (args: string[]) => {
      const joined = args.join(" ");
      if (joined.includes("execution show")) {
        return { status: 0, stdout: "Succeeded\n", stderr: "" };
      }
      return { status: 0, stdout: healthyRevision, stderr: "" };
    }),
  };
}

describe("azure deploy smoke CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints human output and exits zero when all checks pass", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const exitCode = await main(baseArgs, process.env, healthyRunners());

    expect(exitCode).toBe(0);
    expect(log.mock.calls.join("\n")).toContain("Result: PASS");
    expect(log.mock.calls.join("\n")).toContain("PASS app-health");
    expect(error).not.toHaveBeenCalled();
  });

  it("prints JSON output and exits one when a check fails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await main([...baseArgs, "--json"], process.env, {
      ...healthyRunners(),
      http: async () => ({ status: 503, body: { status: "degraded" } }),
    });

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      status: string;
    };
    expect(parsed.status).toBe("fail");
  });

  it("exits two and reports configuration errors", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const exitCode = await main([], process.env, healthyRunners());

    expect(exitCode).toBe(2);
    expect(error.mock.calls.join("\n")).toContain(
      "Missing required smoke setting",
    );
  });

  it("does not print raw sensitive values from failed Azure output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const command: CommandRunner = vi.fn(async (args: string[]) => {
      if (args.join(" ").includes("execution show")) {
        return {
          status: 1,
          stdout: "",
          stderr: "token=super-secret-token password=hunter2",
        };
      }
      return { status: 0, stdout: healthyRevision, stderr: "" };
    });

    const exitCode = await main(baseArgs, process.env, {
      http: async () => ({ status: 200, body: { status: "ok" } }),
      command,
    });

    expect(exitCode).toBe(1);
    const output = log.mock.calls.join("\n");
    expect(output).not.toContain("super-secret-token");
    expect(output).not.toContain("hunter2");
    expect(output).toContain("[REDACTED]");
  });
});
