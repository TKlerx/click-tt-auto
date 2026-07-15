import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { parseRosterCsvBytes } from "./roster-csv.js";

export type NuligaRosterExportOptions = {
  meisterschaft: string;
  region: string;
  season: string;
  charset?: "UTF-8" | "ISO-8859-15";
  timeoutMs?: number;
};

export async function downloadNuligaRosterExport(
  page: Page,
  outDir: string,
  options: NuligaRosterExportOptions
): Promise<string> {
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded" })
      .catch(() => undefined),
    page.getByRole("link", { name: /downloads?/i }).click()
  ]);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await selectByText(
    page,
    /download/i,
    /Tabellen \(aktuelle Tabellen - Filter Meisterschaft\)/i
  );
  await selectByText(page, /meisterschaft/i, options.meisterschaft, {
    allowSingleNonPlaceholder: true
  });
  await selectByText(page, /zeichensatz/i, options.charset ?? "UTF-8");

  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded" })
      .catch(() => undefined),
    page.getByRole("button", { name: /exportieren|export/i }).click()
  ]);
  const csvLink = page.getByRole("link", { name: /\.csv/i }).first();
  await csvLink.waitFor({
    state: "visible",
    timeout: options.timeoutMs ?? 5_000
  });
  const downloadPromise = page
    .waitForEvent("download", {
      timeout: options.timeoutMs ?? 60_000
    })
    .catch(() => null);
  await csvLink.click();
  const download = await downloadPromise;
  if (!download) {
    throw new Error(
      `Timed out waiting for Tabellen CSV download for ${options.meisterschaft}.`
    );
  }

  const tempPath = await download.path();
  if (!tempPath)
    throw new Error("Tabellen export download did not produce a file.");
  const bytes = await fs.readFile(tempPath);
  const parsed = parseRosterCsvBytes(bytes);
  const regions = new Set(parsed.rows.map((row) => row.region));
  const seasons = new Set(parsed.rows.map((row) => row.season));
  if (!regions.has(options.region) || !seasons.has(options.season)) {
    throw new Error(
      `Downloaded Tabellen export mismatch: expected ${options.region} ${options.season}, got ${[...regions].join(", ")} ${[...seasons].join(", ")}.`
    );
  }

  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, safeCsvName(download.suggestedFilename()));
  await fs.writeFile(filePath, bytes);
  return filePath;
}

function safeCsvName(name: string) {
  const safe = name.replace(/[^a-z0-9_.-]+/gi, "-");
  return safe.toLowerCase().endsWith(".csv") ? safe : `${safe}.csv`;
}

async function selectByText(
  page: Page,
  label: RegExp,
  option: RegExp | string,
  config: { allowSingleNonPlaceholder?: boolean } = {}
) {
  const wanted =
    typeof option === "string"
      ? { kind: "string" as const, value: option }
      : { kind: "regex" as const, value: option.source };
  const selects = await selectHandles(page);

  for (const select of selects) {
    const value = await matchingSelectValue(select, {
      wanted,
      allowSingleNonPlaceholder: false
    });
    if (value) {
      await chooseSelectValue(page, select, value);
      return;
    }
  }

  for (const select of selects) {
    const value = await matchingSelectValue(select, {
      wanted,
      allowSingleNonPlaceholder: config.allowSingleNonPlaceholder ?? false
    });
    if (value) {
      await chooseSelectValue(page, select, value);
      return;
    }
  }

  if ((await page.getByLabel(label).count()) > 0) {
    throw new Error(`Could not select option ${String(option)} from ${label}.`);
  }
  throw new Error(`Could not find select for option ${String(option)}.`);
}

async function chooseSelectValue(
  page: Page,
  select: Awaited<ReturnType<typeof selectHandles>>[number],
  value: string
) {
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded" })
      .catch(() => undefined),
    select.selectOption(value)
  ]);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function matchingSelectValue(
  select: Awaited<ReturnType<typeof selectHandles>>[number],
  input: {
    wanted:
      { kind: "string"; value: string } | { kind: "regex"; value: string };
    allowSingleNonPlaceholder: boolean;
  }
) {
  return select.evaluate((element, config) => {
    if (!(element instanceof HTMLSelectElement)) return null;
    if (element.disabled) return null;
    const options = [...element.options];
    const match = options.find((candidate) => {
      if (config.wanted.kind === "regex") {
        return new RegExp(config.wanted.value, "i").test(candidate.text);
      }
      const candidateText = candidate.text
        .toLowerCase()
        .replace(/20(?=\d{2}\/\d{2})/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const wantedText = config.wanted.value
        .toLowerCase()
        .replace(/20(?=\d{2}\/\d{2})/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return candidateText === wantedText || candidateText.includes(wantedText);
    });
    if (match) return match.value;
    const realOptions = options.filter(
      (candidate) => !/^[-\s]*$|bitte w/i.test(candidate.text)
    );
    return config.allowSingleNonPlaceholder && realOptions.length === 1
      ? realOptions[0]?.value
      : null;
  }, input);
}

async function selectHandles(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.locator("select").elementHandles();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/Execution context was destroyed/i.test(error.message)
      ) {
        throw error;
      }
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }
  }
  return page.locator("select").elementHandles();
}
