import type { Locator, Page } from "playwright";
import { assertMatchListPage } from "./match-list.js";

async function clickAndSettle(page: Page, locator: Locator): Promise<void> {
  try {
    await Promise.all([page.waitForLoadState("domcontentloaded", { timeout: 3000 }), locator.click()]);
  } catch {
    await locator.click();
    await page.waitForTimeout(500);
  }
}

async function collectAnchorSnapshot(page: Page): Promise<string> {
  const anchors = page.locator("a");
  const anchorCount = Math.min(await anchors.count(), 20);
  const parts: string[] = [];

  for (let index = 0; index < anchorCount; index += 1) {
    const anchor = anchors.nth(index);
    const text = ((await anchor.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    const href = (await anchor.getAttribute("href").catch(() => "")) ?? "";
    if (text || href) {
      parts.push(`${text || "[no-text]"} -> ${href || "[no-href]"}`);
    }
  }

  return parts.length > 0 ? parts.join(" | ") : "[no anchors found]";
}

async function clickByText(page: Page, texts: RegExp[]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const text of texts) {
      const roleLink = page.getByRole("link", { name: text }).first();
      if ((await roleLink.count()) > 0) {
        await clickAndSettle(page, roleLink);
        return;
      }

      const roleButton = page.getByRole("button", { name: text }).first();
      if ((await roleButton.count()) > 0) {
        await clickAndSettle(page, roleButton);
        return;
      }

      const textLink = page.locator("a").filter({ hasText: text }).first();
      if ((await textLink.count()) > 0) {
        await clickAndSettle(page, textLink);
        return;
      }

      const textButton = page.locator("button, input[type='submit'], input[type='button']").filter({ hasText: text }).first();
      if ((await textButton.count()) > 0) {
        await clickAndSettle(page, textButton);
        return;
      }
    }

    if (attempt < 2) {
      await page.waitForTimeout(600);
    }
  }

  throw new Error(
    `Navigation target not found: ${texts.map((text) => text.source).join(", ")}. Visible anchors: ${await collectAnchorSnapshot(page)}`
  );
}

async function findButtonLikeControl(page: Page, pattern: RegExp) {
  const roleButton = page.getByRole("button", { name: pattern }).first();
  if ((await roleButton.count()) > 0) {
    return roleButton;
  }

  const submitInputs = page.locator("input[type='submit']");
  const submitCount = await submitInputs.count();
  for (let submitIndex = 0; submitIndex < submitCount; submitIndex += 1) {
    const value = await submitInputs.nth(submitIndex).inputValue().catch(() => "");
    if (pattern.test(value)) {
      pattern.lastIndex = 0;
      return submitInputs.nth(submitIndex);
    }
    pattern.lastIndex = 0;
  }

  const textButton = page.locator("button, a").filter({ hasText: pattern }).first();
  if ((await textButton.count()) > 0) {
    return textButton;
  }

  return null;
}

function normalizePageText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function findApprovalCheckbox(page: Page) {
  const labelled = page.getByLabel(/nur noch nicht genehmigte begegnungen anzeigen|genehmigung/i).first();
  if ((await labelled.count()) > 0) {
    return labelled;
  }

  const checkboxNearText = page
    .locator("label, td, div, span")
    .filter({ hasText: /nur noch nicht genehmigte begegnungen anzeigen/i })
    .locator('input[type="checkbox"]')
    .first();
  if ((await checkboxNearText.count()) > 0) {
    return checkboxNearText;
  }

  return null;
}

async function isMatchFilterPage(page: Page): Promise<boolean> {
  const bodyText = normalizePageText(await page.locator("body").textContent());
  const approvalCheckbox = await findApprovalCheckbox(page);
  const searchButton = await findButtonLikeControl(page, /suchen/i);
  const hasExpectedContext = /begegnungen|gruppe|genehmigt/i.test(bodyText);
  return Boolean(approvalCheckbox && searchButton && hasExpectedContext);
}

export async function assertMatchFilterPage(page: Page): Promise<void> {
  if (await isMatchFilterPage(page)) {
    return;
  }

  throw new Error(
    'Expected Begegnungen filter page, but required fields were missing (checkbox "nur noch nicht genehmigte Begegnungen anzeigen", search button, or expected page context).'
  );
}

export async function navigateToMatchSearch(
  page: Page,
  group: string | null,
  options: { onlyUnapproved: boolean } = { onlyUnapproved: true }
): Promise<void> {
  if (!(await isMatchFilterPage(page))) {
    await clickByText(page, [/Spielbetrieb.?Kontrolle/i, /Spielbetrieb/i]);
  }

  if (!(await isMatchFilterPage(page))) {
    await clickByText(page, [/Begegnungen/i]);
  }

  await assertMatchFilterPage(page);

  const approvalCheckbox = await findApprovalCheckbox(page);
  if (!approvalCheckbox) {
    throw new Error('Could not find checkbox "nur noch nicht genehmigte Begegnungen anzeigen".');
  }

  const isChecked = await approvalCheckbox.isChecked().catch(() => false);
  if (options.onlyUnapproved && !isChecked) {
    await approvalCheckbox.check();
  }

  if (!options.onlyUnapproved && isChecked) {
    await approvalCheckbox.uncheck();
  }

  if (group) {
    const groupSelect = page.locator('select[name*="gruppe" i], select').first();
    if ((await groupSelect.count()) === 0) {
      throw new Error("Group select not found on filter page.");
    }

    await groupSelect.selectOption({ label: group }).catch(async () => {
      await groupSelect.selectOption({ value: group });
    });
  }

  const searchButton = await findButtonLikeControl(page, /suchen/i);
  if (!searchButton) {
    throw new Error("Search button not found on match filter page.");
  }

  await clickAndSettle(page, searchButton);
  await assertMatchListPage(page);
}

export async function returnToListAfterSave(page: Page): Promise<void> {
  try {
    await assertMatchListPage(page);
    return;
  } catch {
    // Not already on list page.
  }

  const returnPatterns = [
    /zur[üuÃ]ck zur einstiegsseite|zuruck zur einstiegsseite/i,
    /<<\s*zur[üuÃ]ck|<<\s*zuruck/i,
    /^zur[üuÃ]ck$|^zuruck$/i,
    /begegnungen/i
  ];

  for (const pattern of returnPatterns) {
    const roleTarget = page.getByRole("link", { name: pattern }).first();
    if ((await roleTarget.count()) > 0) {
      await clickAndSettle(page, roleTarget);
      await assertMatchListPage(page);
      return;
    }

    const textTarget = page.locator("a").filter({ hasText: pattern }).first();
    if ((await textTarget.count()) > 0) {
      await clickAndSettle(page, textTarget);
      await assertMatchListPage(page);
      return;
    }

    const buttonTarget = await findButtonLikeControl(page, pattern);
    if (buttonTarget) {
      await clickAndSettle(page, buttonTarget);
      await assertMatchListPage(page);
      return;
    }
  }

  try {
    await page.goBack({ waitUntil: "domcontentloaded" });
    await assertMatchListPage(page);
    return;
  } catch {
    // Fall through to final error.
  }

  throw new Error(`Return-to-list control not found after saving. Visible anchors: ${await collectAnchorSnapshot(page)}`);
}

export async function cancelAndReturn(page: Page): Promise<void> {
  const cancelControl = await findButtonLikeControl(page, /abbrechen/i);
  if (!cancelControl) {
    throw new Error("Cancel control not found on detail page.");
  }

  await clickAndSettle(page, cancelControl);
  await assertMatchListPage(page);
}
