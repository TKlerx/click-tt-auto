import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { login } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { assignmentRowsToCsv, scrapeTeamRasterAssignments } from "../src/raster/ingest/index.ts";

const config = loadConfig([]);
const outputDir = path.resolve("reports/raster");
const jsonPath = path.join(outputDir, "team-raster-assignment.json");
const csvPath = path.join(outputDir, "team-raster-assignment.csv");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await login(page, config.baseUrl, config.username, config.password);
  const assignments = await scrapeTeamRasterAssignments(page);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(assignments, null, 2)}\n`);
  await fs.writeFile(csvPath, assignmentRowsToCsv(assignments));

  console.log(`wrote ${assignments.length} assignments across ${new Set(assignments.map((row) => row.group)).size} groups`);
  console.log(jsonPath);
  console.log(csvPath);
} finally {
  await browser.close();
}
