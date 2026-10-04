import { afterEach, describe, expect, it, vi } from "vitest";

// Regression goal: startup budgets must not weaken individual test limits.
describe("Playwright web-server startup timeout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to ten minutes without changing the per-test timeout", async () => {
    vi.stubEnv("E2E_WEB_SERVER_TIMEOUT_MS", undefined);
    const config = (await import("../../playwright.config")).default;
    expect(getWebServerTimeout(config.webServer)).toBe(600_000);
    expect(config.timeout).toBe(60_000);
  });

  it.each(["720000", "1", "1234.5"])(
    "accepts a finite positive override (%s ms) only for startup",
    async (value) => {
      vi.stubEnv("E2E_WEB_SERVER_TIMEOUT_MS", value);
      const config = (await import("../../playwright.config")).default;
      expect(getWebServerTimeout(config.webServer)).toBe(Number(value));
      expect(config.timeout).toBe(60_000);
    },
  );

  it.each([
    "",
    " ",
    "not-a-duration",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "-Infinity",
    "1e309",
  ])(
    "rejects invalid override %j by retaining the safe startup default",
    async (value) => {
      vi.stubEnv("E2E_WEB_SERVER_TIMEOUT_MS", value);
      const config = (await import("../../playwright.config")).default;
      expect(getWebServerTimeout(config.webServer)).toBe(600_000);
      expect(config.timeout).toBe(60_000);
    },
  );
});

function getWebServerTimeout(webServer: unknown) {
  if (Array.isArray(webServer)) {
    throw new Error("Expected one configured Playwright web server");
  }

  if (!webServer || typeof webServer !== "object") {
    return undefined;
  }

  return (webServer as { timeout?: unknown }).timeout;
}
