import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config.js";

const originalEnv = {
  CLICK_TT_USERNAME: process.env.CLICK_TT_USERNAME,
  CLICK_TT_PASSWORD: process.env.CLICK_TT_PASSWORD,
  CLICK_TT_URL: process.env.CLICK_TT_URL,
  CLICK_TT_FINE_CATALOGUE_PATH: process.env.CLICK_TT_FINE_CATALOGUE_PATH
};

const tempDirs: string[] = [];

function setRequiredEnv(): void {
  process.env.CLICK_TT_USERNAME = "tester";
  process.env.CLICK_TT_PASSWORD = "secret";
  process.env.CLICK_TT_URL = "https://example.invalid";
}

function restoreEnv(name: keyof typeof originalEnv): void {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(async () => {
  restoreEnv("CLICK_TT_USERNAME");
  restoreEnv("CLICK_TT_PASSWORD");
  restoreEnv("CLICK_TT_URL");
  restoreEnv("CLICK_TT_FINE_CATALOGUE_PATH");

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
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

  it("loads a season fine catalogue from the configured path", async () => {
    setRequiredEnv();
    const dir = await mkdtemp(path.join(os.tmpdir(), "click-tt-config-"));
    tempDirs.push(dir);
    const cataloguePath = path.join(dir, "fine-catalogue.json");
    await writeFile(
      cataloguePath,
      JSON.stringify({
        seasons: {
          "2025-2026": {
            leagues: {
              Bezirksoberliga: {
                lowestTeams: ["TTS Detmold III"],
                events: {
                  "nicht-angetreten": {
                    kosten: 125,
                    lowestTeam: {
                      kosten: 50
                    }
                  },
                  "error-message": {
                    patterns: [
                      {
                        match: "Falsche Einzelaufstellung",
                        rechtsgrundlage: "A 20.1.5 b",
                        kosten: 10
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }),
      "utf8"
    );
    process.env.CLICK_TT_FINE_CATALOGUE_PATH = cataloguePath;

    const config = loadConfig([]);

    expect(config.fineCataloguePath).toBe(cataloguePath);
    expect(config.fineCatalogue?.seasons["2025-2026"]?.leagues?.Bezirksoberliga?.events?.["nicht-angetreten"]?.kosten).toBe(125);
    expect(config.fineCatalogue?.seasons["2025-2026"]?.leagues?.Bezirksoberliga?.lowestTeams).toContain("TTS Detmold III");
    expect(config.fineCatalogue?.seasons["2025-2026"]?.leagues?.Bezirksoberliga?.events?.["nicht-angetreten"]?.lowestTeam?.kosten).toBe(50);
    expect(config.fineCatalogue?.seasons["2025-2026"]?.leagues?.Bezirksoberliga?.events?.["error-message"]?.patterns?.[0]?.match).toBe(
      "Falsche Einzelaufstellung"
    );
  });
});
