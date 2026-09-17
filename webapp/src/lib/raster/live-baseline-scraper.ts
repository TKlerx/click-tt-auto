import { chromium } from "playwright";
import { login } from "../../../../src/auth.js";
import {
  scrapeTeamRasterAssignments,
  type TeamRasterAssignmentRow,
  type TeamRasterAssignmentScrapeOptions,
} from "../../../../src/raster/ingest/clicktt-assignments.js";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export async function scrapeLiveBaselineAssignments(
  options: TeamRasterAssignmentScrapeOptions = {},
): Promise<TeamRasterAssignmentRow[]> {
  const browser = await chromium.launch({
    headless: process.env.CLICK_TT_HEADED !== "1",
    slowMo: Number(process.env.CLICK_TT_SLOW_MO_MS ?? 0),
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await login(
      page as never,
      requiredEnvironment("CLICK_TT_URL"),
      requiredEnvironment("CLICK_TT_USERNAME"),
      requiredEnvironment("CLICK_TT_PASSWORD"),
    );
    return await scrapeTeamRasterAssignments(page, options);
  } finally {
    await context.close();
    await browser.close();
  }
}
