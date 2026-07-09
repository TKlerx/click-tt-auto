import { afterEach, describe, expect, it, vi } from "vitest";

describe("instrumentation logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    globalThis.__businessAppStarterInstrumentationRegistered = false;
  });

  it("logs process-level events with standard event shape and component metadata", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handlers = new Map<string, (value: unknown) => void>();
    const originalProcess = globalThis.process;
    vi.stubGlobal("process", {
      ...originalProcess,
      env: originalProcess.env,
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers.set(event, handler);
        return globalThis.process;
      }),
    });

    const { register } = await import("@/instrumentation");
    await register();
    handlers.get("uncaughtException")?.(new Error("boom"));
    handlers.get("unhandledRejection")?.("rejected");

    const initialized = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(initialized).toMatchObject({
      event: "observability.initialized",
      component: "instrumentation",
    });

    const uncaught = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(uncaught).toMatchObject({
      event: "process.uncaught_exception",
      component: "instrumentation",
    });

    const rejection = JSON.parse(String(errorSpy.mock.calls[1][0]));
    expect(rejection).toMatchObject({
      event: "process.unhandled_rejection",
      component: "instrumentation",
    });

    vi.unstubAllGlobals();
  });
});
