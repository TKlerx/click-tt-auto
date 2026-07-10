import type {
  TeamRasterAssignmentRow,
  WishParseResult,
} from "../../../../src/raster/ingest/index.js";

type WishesPdfModule = {
  parseWishesPdf(filePath: string): Promise<WishParseResult>;
  readAssignmentTable(filePath: string): Promise<TeamRasterAssignmentRow[]>;
};

type ClickTtScrapeModule = {
  scrapeCurrentTeamRasterAssignments(): Promise<TeamRasterAssignmentRow[]>;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
}

async function parseWishesPdf(filePath: string): Promise<WishParseResult> {
  const modulePath = new URL(
    "../../../../src/raster/ingest/wishes-pdf.ts",
    import.meta.url,
  ).href;
  const wishesPdf = (await import(
    /* webpackIgnore: true */ modulePath
  )) as WishesPdfModule;
  return wishesPdf.parseWishesPdf(filePath);
}

async function readAssignmentTable(
  filePath: string,
): Promise<TeamRasterAssignmentRow[]> {
  const modulePath = new URL(
    "../../../../src/raster/ingest/index.ts",
    import.meta.url,
  ).href;
  const ingest = (await import(
    /* webpackIgnore: true */ modulePath
  )) as WishesPdfModule;
  return ingest.readAssignmentTable(filePath);
}

async function scrapeClickTtAssignments(): Promise<TeamRasterAssignmentRow[]> {
  const modulePath = new URL(
    "../../../../src/raster/ingest/scrape.ts",
    import.meta.url,
  ).href;
  const scrape = (await import(
    /* webpackIgnore: true */ modulePath
  )) as ClickTtScrapeModule;
  return scrape.scrapeCurrentTeamRasterAssignments();
}

export const rasterIngest = {
  parseCsvLine,
  parseWishesPdf,
  readAssignmentTable,
  scrapeClickTtAssignments,
};
