import type { WishParseResult } from "../../../../src/raster/ingest/index.js";

type WishesPdfModule = {
  parseWishesPdf(filePath: string): Promise<WishParseResult>;
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
  const modulePath = "../../../../src/raster/ingest/wishes-pdf.js";
  const wishesPdf = (await import(
    /* webpackIgnore: true */ modulePath
  )) as WishesPdfModule;
  return wishesPdf.parseWishesPdf(filePath);
}

export const rasterIngest = {
  parseCsvLine,
  parseWishesPdf,
};
