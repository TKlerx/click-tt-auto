import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import minimist from "minimist";
import path from "node:path";
import type { AppConfig, FineCatalogue } from "./types.js";

interface CliArgs {
  "dry-run"?: boolean;
  debug?: boolean;
  group?: string;
  headed?: boolean;
  "halt-on-error"?: boolean;
  "plain-progress"?: boolean;
  "process-all"?: boolean;
  "slow-mo"?: string;
  "report-dir"?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertFineCatalogueEvents(events: unknown, sourcePath: string, scope: string): void {
  if (events !== undefined && !isRecord(events)) {
    throw new Error(`Invalid fine catalogue ${sourcePath}. ${scope} events must be an object.`);
  }

  if (!isRecord(events)) {
    return;
  }

  for (const [eventName, entry] of Object.entries(events)) {
    if (!isRecord(entry)) {
      throw new Error(`Invalid fine catalogue ${sourcePath}. ${scope} event ${eventName} must be an object.`);
    }

    if (entry.patterns !== undefined && !Array.isArray(entry.patterns)) {
      throw new Error(`Invalid fine catalogue ${sourcePath}. ${scope} event ${eventName} patterns must be an array.`);
    }

    if (Array.isArray(entry.patterns)) {
      for (const pattern of entry.patterns) {
        if (!isRecord(pattern) || typeof pattern.match !== "string" || !pattern.match.trim()) {
          throw new Error(`Invalid fine catalogue ${sourcePath}. ${scope} event ${eventName} patterns require a match string.`);
        }
      }
    }

    if (entry.lowestTeam !== undefined && !isRecord(entry.lowestTeam)) {
      throw new Error(`Invalid fine catalogue ${sourcePath}. ${scope} event ${eventName} lowestTeam must be an object.`);
    }
  }
}

function assertLowestTeams(value: unknown, sourcePath: string, scope: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid fine catalogue ${sourcePath}. ${scope} lowestTeams must be an array of team names.`);
  }
}

function assertFineCatalogue(value: unknown, sourcePath: string): asserts value is FineCatalogue {
  if (!isRecord(value) || !isRecord(value.seasons)) {
    throw new Error(`Invalid fine catalogue ${sourcePath}. Expected an object with a seasons map.`);
  }

  for (const [seasonName, season] of Object.entries(value.seasons)) {
    if (!isRecord(season)) {
      throw new Error(`Invalid fine catalogue ${sourcePath}. Season ${seasonName} must be an object.`);
    }

    assertFineCatalogueEvents(season.events, sourcePath, `Season ${seasonName}`);
    assertLowestTeams(season.lowestTeams, sourcePath, `Season ${seasonName}`);

    if (season.leagues !== undefined && !isRecord(season.leagues)) {
      throw new Error(`Invalid fine catalogue ${sourcePath}. Season ${seasonName} leagues must be an object.`);
    }

    if (isRecord(season.leagues)) {
      for (const [leagueName, league] of Object.entries(season.leagues)) {
        if (!isRecord(league)) {
          throw new Error(`Invalid fine catalogue ${sourcePath}. League ${leagueName} in season ${seasonName} must be an object.`);
        }
        assertFineCatalogueEvents(league.events, sourcePath, `League ${leagueName} in season ${seasonName}`);
        assertLowestTeams(league.lowestTeams, sourcePath, `League ${leagueName} in season ${seasonName}`);
      }
    }
  }
}

function loadFineCatalogue(cataloguePath: string | null): FineCatalogue | null {
  if (!cataloguePath) {
    return null;
  }

  const resolvedPath = path.resolve(cataloguePath);
  const parsed: unknown = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  assertFineCatalogue(parsed, resolvedPath);
  return parsed;
}

export function loadConfig(argv = process.argv.slice(2)): AppConfig {
  loadEnv();

  const explicitNoHaltOnError = argv.includes("--no-halt-on-error");
  const explicitHaltOnError = argv.includes("--halt-on-error");

  const args = minimist<CliArgs>(argv, {
    boolean: ["dry-run", "debug", "headed", "halt-on-error", "plain-progress", "process-all"],
    string: ["group", "slow-mo", "report-dir"],
    alias: { g: "group" },
    default: {
      "dry-run": false,
      debug: false,
      headed: false,
      "halt-on-error": false,
      "plain-progress": false,
      "process-all": false,
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
  const fineWorkbookPath = process.env.CLICK_TT_FINE_WORKBOOK_PATH?.trim() || null;
  const fineSheetName = process.env.CLICK_TT_FINE_SHEET_NAME?.trim() || null;
  const fineIgnoreColumn = process.env.CLICK_TT_FINE_IGNORE_COLUMN?.trim() || "Ignore";
  const fineSpielleiter = process.env.CLICK_TT_FINE_SPIELLEITER?.trim() || null;
  const fineLiga = process.env.CLICK_TT_FINE_DEFAULT_LIGA?.trim() || null;
  const fineGruppe = process.env.CLICK_TT_FINE_DEFAULT_GRUPPE?.trim() || null;
  const fineNaKosten = Number.parseInt(process.env.CLICK_TT_FINE_NA_KOSTEN?.trim() || "100", 10);
  const fineCataloguePath = process.env.CLICK_TT_FINE_CATALOGUE_PATH?.trim() || null;
  const resolvedFineCataloguePath = fineCataloguePath ? path.resolve(fineCataloguePath) : null;
  const fineCatalogue = loadFineCatalogue(resolvedFineCataloguePath);

  if (Number.isNaN(fineNaKosten) || fineNaKosten < 0) {
    throw new Error("Invalid CLICK_TT_FINE_NA_KOSTEN value. Use a non-negative integer.");
  }

  if (!username || !password) {
    throw new Error("Missing click-TT credentials. Populate CLICK_TT_USERNAME and CLICK_TT_PASSWORD in .env.");
  }

  return {
    username,
    password,
    baseUrl,
    dryRun: Boolean(args["dry-run"]),
    processAll: Boolean(args["process-all"]),
    debug,
    headed: debug || Boolean(args.headed),
    haltOnError: explicitNoHaltOnError ? false : explicitHaltOnError || debug,
    plainProgress: Boolean(args["plain-progress"]),
    slowMoMs: debug ? Math.max(slowMoMs, 1200) : slowMoMs,
    group: args.group?.trim() || null,
    reportDir: path.resolve(args["report-dir"] ?? "reports"),
    fineWorkbookPath: fineWorkbookPath ? path.resolve(fineWorkbookPath) : null,
    fineSheetName,
    fineIgnoreColumn,
    fineSpielleiter,
    fineLiga,
    fineGruppe,
    fineNaKosten,
    fineCataloguePath: resolvedFineCataloguePath,
    fineCatalogue
  };
}
