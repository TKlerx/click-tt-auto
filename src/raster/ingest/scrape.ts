import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type APIRequestContext, type Page } from "playwright";
import { login } from "../../auth.js";
import { loadConfig } from "../../config.js";
import { assignmentRowsToCsv } from "./assignment-table.js";
import {
  scrapePublicLeagueAssignments,
  scrapeTeamRasterAssignments,
  type TeamRasterAssignmentScrapeOptions,
  type TeamRasterAssignmentRow
} from "./clicktt-assignments.js";
import { buildSeasonModel, buildSeasonModelFromAssignments } from "./model.js";
import type { SeasonModel } from "../types.js";

interface LinkSnapshot {
  text: string;
  href: string;
}

const crawlText =
  /meldung|wunsch|wünsche|wuensche|gruppe|raster|spielbetrieb|organisation|download|export|bezirk|liga/i;
const wishText =
  /terminmeldungen?|vereinsmeldung|terminwünsche|terminwuensche|wunsch|wünsche|wuensche/i;
const groupText =
  /gruppen.*raster|raster.*gruppen|gruppeneinteilung|rasterzahl|tabelle.*spielplan|gruppen-spielplan|ScheduleReportFOP/i;

function safeName(prefix: string, url: string): string {
  const name =
    new URL(url).pathname
      .split("/")
      .at(-1)
      ?.replace(/[^a-z0-9.-]+/gi, "-") || `${prefix}.pdf`;
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function sameOrigin(url: string, base: string): boolean {
  return new URL(url).origin === new URL(base).origin;
}

function canDownload(url: string, base: string): boolean {
  const host = new URL(url).hostname;
  return (
    sameOrigin(url, base) ||
    host === "www.click-tt.de" ||
    host.endsWith(".click-tt.de")
  );
}

async function collectLinks(page: Page): Promise<LinkSnapshot[]> {
  return page.locator("a").evaluateAll((anchors) =>
    anchors.flatMap((anchor) => {
      const href = anchor instanceof HTMLAnchorElement ? anchor.href : "";
      const text = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      return href ? [{ href, text }] : [];
    })
  );
}

async function downloadPdf(
  request: APIRequestContext,
  url: string,
  outDir: string,
  prefix: string
): Promise<string | null> {
  const response = await request
    .get(url, { timeout: 15_000 })
    .catch(() => null);
  if (!response?.ok()) return null;
  const contentType = response.headers()["content-type"] ?? "";
  if (!/pdf/i.test(contentType) && !/\.pdf(?:$|[?#])/i.test(url)) return null;

  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${prefix}-${safeName(prefix, url)}`);
  await fs.writeFile(filePath, await response.body());
  return filePath;
}

function interesting(link: LinkSnapshot): boolean {
  return (
    crawlText.test(`${link.text} ${link.href}`) &&
    !/abmelden|logout|löschen|loeschen|speichern|genehmig/i.test(link.text)
  );
}

export async function scrapeSeasonModel(
  fixedRows: TeamRasterAssignmentRow[] = [],
  publicLeagueUrl?: string
): Promise<SeasonModel> {
  const config = loadConfig();
  const browser = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMoMs
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const outDir = path.resolve("reports/raster/clicktt-downloads");
  const seen = new Set<string>();
  const queue: string[] = [];
  const sampledLinks: string[] = [];
  const wishes: string[] = [];
  const downloaded = new Set<string>();
  let groups: string | null = null;

  try {
    await login(page, config.baseUrl, config.username, config.password);
    const assignmentRows = await scrapeTeamRasterAssignments(page);
    const assignmentClubNames = new Set(
      assignmentRows.map((row) =>
        row.team
          .replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, "")
          .trim()
          .toLowerCase()
      )
    );
    const allPublicRows = publicLeagueUrl
      ? await scrapePublicLeagueAssignments(page, publicLeagueUrl)
      : [];
    const adminTeams = new Set(
      assignmentRows.map((row) => row.team.toLowerCase())
    );
    const publicAdminGroups = new Set(
      allPublicRows.flatMap((row) =>
        adminTeams.has(row.team.toLowerCase()) ? [row.sourceUrl] : []
      )
    );
    const relevantPublicGroups = new Set(
      allPublicRows.flatMap((row) =>
        !publicAdminGroups.has(row.sourceUrl) &&
        assignmentClubNames.has(
          row.team
            .replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, "")
            .trim()
            .toLowerCase()
        )
          ? [row.group]
          : []
      )
    );
    const publicRows = allPublicRows.filter((row) =>
      relevantPublicGroups.has(row.group)
    );
    const modelRows = assignmentRows;
    await fs.mkdir("reports/raster", { recursive: true });
    await fs.writeFile(
      "reports/raster/team-raster-assignment.json",
      `${JSON.stringify(modelRows, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      "reports/raster/team-raster-assignment.csv",
      assignmentRowsToCsv(modelRows),
      "utf8"
    );
    if (publicRows.length > 0) {
      await fs.writeFile(
        "reports/raster/public-team-context.csv",
        assignmentRowsToCsv(publicRows).replace(
          /^league,group,division,rasterzahl,/,
          "league,group,division,rank,"
        ),
        "utf8"
      );
    }
    const wishFilesByUrl = new Map<string, string>();
    for (const row of assignmentRows) {
      if (!row.wishUrl || wishFilesByUrl.has(row.wishUrl)) continue;
      const wish = await downloadPdf(
        context.request,
        row.wishUrl,
        outDir,
        "wishes"
      );
      if (wish) wishFilesByUrl.set(row.wishUrl, wish);
    }
    if (modelRows.length > 0) {
      return await buildSeasonModelFromAssignments(
        modelRows,
        wishFilesByUrl,
        fixedRows
      );
    }

    queue.push(page.url());

    while (queue.length > 0 && seen.size < 30) {
      const url = queue.shift()!;
      if (seen.has(url) || !sameOrigin(url, config.baseUrl)) continue;
      seen.add(url);
      await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 })
        .catch(() => undefined);

      for (const link of await collectLinks(page)) {
        const label = `${link.text} -> ${link.href}`;
        if (sampledLinks.length < 30) sampledLinks.push(label);
        if (!interesting(link)) continue;

        if (
          !groups &&
          canDownload(link.href, config.baseUrl) &&
          groupText.test(`${link.text} ${link.href}`)
        ) {
          groups = await downloadPdf(
            context.request,
            link.href,
            outDir,
            "groups"
          );
        }
        if (
          canDownload(link.href, config.baseUrl) &&
          wishText.test(`${link.text} ${link.href}`) &&
          !downloaded.has(link.href)
        ) {
          downloaded.add(link.href);
          const wish = await downloadPdf(
            context.request,
            link.href,
            outDir,
            "wishes"
          );
          if (wish) wishes.push(wish);
        }
        if (
          sameOrigin(link.href, config.baseUrl) &&
          !seen.has(link.href) &&
          queue.length < 60
        ) {
          queue.push(link.href);
        }
      }
    }

    if (!groups || wishes.length === 0) {
      throw new Error(
        `Could not find click-TT raster PDF downloads. Use --wishes/--groups, or provide the menu path. Visible links: ${sampledLinks.join(" | ")}`
      );
    }

    return await buildSeasonModel(wishes, groups);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function scrapeCurrentTeamRasterAssignments(): Promise<
  TeamRasterAssignmentRow[]
>;
export async function scrapeCurrentTeamRasterAssignments(
  options: TeamRasterAssignmentScrapeOptions
): Promise<TeamRasterAssignmentRow[]>;
export async function scrapeCurrentTeamRasterAssignments(
  options: TeamRasterAssignmentScrapeOptions = {}
): Promise<TeamRasterAssignmentRow[]> {
  const config = loadConfig();
  const browser = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMoMs
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, config.baseUrl, config.username, config.password);
    return await scrapeTeamRasterAssignments(page, options);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function scrapePublicLeagueAssignmentsFromUrl(
  leaguePageUrl: string
): Promise<TeamRasterAssignmentRow[]> {
  const config = loadConfig();
  const browser = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMoMs
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    return await scrapePublicLeagueAssignments(page, leaguePageUrl);
  } finally {
    await context.close();
    await browser.close();
  }
}
