import { config as loadEnv } from "dotenv";
import minimist from "minimist";
import path from "node:path";
import type { AppConfig } from "./types.js";

interface CliArgs {
  "dry-run"?: boolean;
  debug?: boolean;
  group?: string;
  headed?: boolean;
  "halt-on-error"?: boolean;
  "plain-progress"?: boolean;
  "slow-mo"?: string;
  "report-dir"?: string;
}

export function loadConfig(argv = process.argv.slice(2)): AppConfig {
  loadEnv();

  const args = minimist<CliArgs>(argv, {
    boolean: ["dry-run", "debug", "headed", "halt-on-error", "plain-progress"],
    string: ["group", "slow-mo", "report-dir"],
    alias: { g: "group" },
    default: {
      "dry-run": false,
      debug: false,
      headed: false,
      "halt-on-error": false,
      "plain-progress": false,
      "slow-mo": "0",
      "report-dir": "reports"
    }
  });

  const debug = Boolean(args.debug);
  const slowMoMs = Number.parseInt(args["slow-mo"] ?? "0", 10);
  if (Number.isNaN(slowMoMs) || slowMoMs < 0) {
    throw new Error("Invalid --slow-mo value. Use a non-negative number of milliseconds.");
  }

  const username = process.env.CLICK_TT_USERNAME?.trim() ?? "";
  const password = process.env.CLICK_TT_PASSWORD?.trim() ?? "";
  const baseUrl =
    process.env.CLICK_TT_URL?.trim() ||
    "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa";

  if (!username || !password) {
    throw new Error("Missing click-TT credentials. Populate CLICK_TT_USERNAME and CLICK_TT_PASSWORD in .env.");
  }

  return {
    username,
    password,
    baseUrl,
    dryRun: Boolean(args["dry-run"]),
    debug,
    headed: debug || Boolean(args.headed),
    haltOnError: debug || Boolean(args["halt-on-error"]),
    plainProgress: Boolean(args["plain-progress"]),
    slowMoMs: debug ? Math.max(slowMoMs, 1200) : slowMoMs,
    group: args.group?.trim() || null,
    reportDir: path.resolve(args["report-dir"] ?? "reports")
  };
}
