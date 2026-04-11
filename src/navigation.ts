import type { Page } from "playwright";
import { assertMatchListPage } from "./match-list.js";

async function clickByText(page: Page, texts: RegExp[]): Promise<void> {
  for (const text of texts) {
    const roleLink = page.getByRole("link", { name: text }).first();
    if ((await roleLink.count()) > 0) {
      await Promise.all([page.waitForLoadState("domcontentloaded"), roleLink.click()]);
      return;
    }

    const roleButton = page.getByRole("button", { name: text }).first();
    if ((await roleButton.count()) > 0) {
      await Promise.all([page.waitForLoadState("domcontentloaded"), roleButton.click()]);
      return;
    }
  }

  throw new Error(`Navigation target not found: ${texts.map((text) => text.source).join(", ")}`);
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

export async function assertMatchFilterPage(page: Page): Promise<void> {
  const bodyText = normalizePageText(await page.locator("body").textContent());
  const approvalCheckbox = await findApprovalCheckbox(page);
  const hasSearchButton = (await page.getByRole("button", { name: /suchen/i }).count()) > 0;
  const hasExpectedContext = /begegnungen|gruppe|genehmigt/i.test(bodyText);

  if (!approvalCheckbox || !hasSearchButton || !hasExpectedContext) {
    throw new Error(
      'Expected Begegnungen filter page, but required fields were missing (checkbox "nur noch nicht genehmigte Begegnungen anzeigen", search button, or expected page context).'
    );
  }
}

export async function navigateToMatchSearch(page: Page, group: string | null): Promise<void> {
  await clickByText(page, [/Spielbetrieb.?Kontrolle/i, /Spielbetrieb/i]);
  await clickByText(page, [/Begegnungen/i]);
  await assertMatchFilterPage(page);

  const approvalCheckbox = await findApprovalCheckbox(page);
  if (!approvalCheckbox) {
    throw new Error('Could not find checkbox "nur noch nicht genehmigte Begegnungen anzeigen".');
  }

  if (!(await approvalCheckbox.isChecked().catch(() => false))) {
    await approvalCheckbox.check();
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

  const searchButton = page.getByRole("button", { name: /suchen/i }).first();
  if ((await searchButton.count()) === 0) {
    throw new Error("Search button not found on match filter page.");
  }

  await Promise.all([page.waitForLoadState("domcontentloaded"), searchButton.click()]);
  await assertMatchListPage(page);
}

export async function returnToListAfterSave(page: Page): Promise<void> {
  const target = page.getByRole("link", { name: /zurück zur einstiegsseite|zuruck zur einstiegsseite/i }).first();
  if ((await target.count()) === 0) {
    throw new Error("Return-to-list control not found after saving.");
  }

  await Promise.all([page.waitForLoadState("domcontentloaded"), target.click()]);
  await assertMatchListPage(page);
}

export async function cancelAndReturn(page: Page): Promise<void> {
  const cancelControl = await findButtonLikeControl(page, /abbrechen/i);
  if (!cancelControl) {
    throw new Error("Cancel control not found on detail page.");
  }

  await Promise.all([page.waitForLoadState("domcontentloaded"), cancelControl.click()]);
  await assertMatchListPage(page);
}
