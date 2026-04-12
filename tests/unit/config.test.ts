import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const originalEnv = {
  CLICK_TT_USERNAME: process.env.CLICK_TT_USERNAME,
  CLICK_TT_PASSWORD: process.env.CLICK_TT_PASSWORD,
  CLICK_TT_URL: process.env.CLICK_TT_URL
};

function setRequiredEnv(): void {
  process.env.CLICK_TT_USERNAME = "tester";
  process.env.CLICK_TT_PASSWORD = "secret";
  process.env.CLICK_TT_URL = "https://example.invalid";
}

afterEach(() => {
  process.env.CLICK_TT_USERNAME = originalEnv.CLICK_TT_USERNAME;
  process.env.CLICK_TT_PASSWORD = originalEnv.CLICK_TT_PASSWORD;
  process.env.CLICK_TT_URL = originalEnv.CLICK_TT_URL;
});

describe("loadConfig", () => {
  it("enables halt-on-error by default in debug mode", () => {
    setRequiredEnv();

    const config = loadConfig(["--debug"]);

    expect(config.debug).toBe(true);
    expect(config.headed).toBe(true);
    expect(config.haltOnError).toBe(true);
  });

  it("allows debug mode without halting on error when explicitly disabled", () => {
    setRequiredEnv();

    const config = loadConfig(["--debug", "--no-halt-on-error"]);

    expect(config.debug).toBe(true);
    expect(config.headed).toBe(true);
    expect(config.haltOnError).toBe(false);
  });
});
