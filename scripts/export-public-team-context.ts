import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { assignmentRowsToCsv, scrapePublicLeagueAssignments } from "../src/raster/ingest/index.ts";

const url =
  process.argv[2] ??
  "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/leaguePage?championship=Ostwestfalen/Lippe%2026/27";
const out = process.argv[3] ?? "reports/raster/public-team-context.csv";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const rows = await scrapePublicLeagueAssignments(page, url);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(
    out,
    assignmentRowsToCsv(rows).replace(/^league,group,division,rasterzahl,/, "league,group,division,rank,"),
    "utf8"
  );
  console.log(`wrote ${out} (${rows.length} rows across ${new Set(rows.map((row) => row.group)).size} groups)`);
} finally {
  await browser.close();
}
