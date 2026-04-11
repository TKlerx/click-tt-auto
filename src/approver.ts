import type { Page } from "playwright";
import { isApprovalCheckboxText } from "./approval-checkbox.js";
import { cancelAndReturn, returnToListAfterSave } from "./navigation.js";

async function getCheckboxContextText(page: Page, checkboxIndex: number): Promise<string> {
  const checkbox = page.locator('input[type="checkbox"]').nth(checkboxIndex);
  return checkbox.evaluate((element) => {
    const input = element as HTMLInputElement;
    let associatedLabel = "";

    if (input.id) {
      const labels = Array.from(document.querySelectorAll("label"));
      for (const label of labels) {
        if (label.htmlFor === input.id) {
          associatedLabel = (label.textContent ?? "").replace(/\s+/g, " ").trim();
          break;
        }
      }
    }

    const rawParts = [
      input.getAttribute("aria-label"),
      associatedLabel,
      input.parentElement?.textContent ?? "",
      input.closest("label, p, td, div, span")?.textContent ?? "",
      input.previousSibling?.textContent ?? "",
      input.nextSibling?.textContent ?? ""
    ];

    const seen = new Set<string>();
    const normalizedParts: string[] = [];

    for (const rawPart of rawParts) {
      const normalizedPart = (rawPart ?? "").replace(/\s+/g, " ").trim();
      if (normalizedPart && !seen.has(normalizedPart)) {
        seen.add(normalizedPart);
        normalizedParts.push(normalizedPart);
      }
    }

    return normalizedParts.join(" ").replace(/\s+/g, " ").trim();
  });
}

async function findApprovalCheckbox(page: Page) {
  const labelled = page.getByLabel(/spielbericht genehmigt/i).first();
  if ((await labelled.count()) > 0) {
    return labelled;
  }

  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();

  for (let index = 0; index < checkboxCount; index += 1) {
    const contextText = await getCheckboxContextText(page, index);
    if (isApprovalCheckboxText(contextText)) {
      return checkboxes.nth(index);
    }
  }

  return null;
}

async function findSaveControl(page: Page) {
  const roleButton = page.getByRole("button", { name: /speichern/i }).first();
  if ((await roleButton.count()) > 0) {
    return roleButton;
  }

  const submitInput = page.locator('input[type="submit"][value*="speichern" i]').first();
  if ((await submitInput.count()) > 0) {
    return submitInput;
  }

  const textButton = page.locator("button, a").filter({ hasText: /speichern/i }).first();
  if ((await textButton.count()) > 0) {
    return textButton;
  }

  return null;
}

async function describeVisibleCheckboxes(page: Page): Promise<string> {
  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  const texts: string[] = [];

  for (let index = 0; index < checkboxCount; index += 1) {
    const contextText = await getCheckboxContextText(page, index);
    texts.push(contextText || "[no nearby text]");
  }

  return texts.length > 0 ? texts.join(" | ") : "[no checkboxes on page]";
}

export async function handleApproval(page: Page, dryRun: boolean, shouldApprove: boolean): Promise<void> {
  if (!shouldApprove) {
    await cancelAndReturn(page);
    return;
  }

  const checkbox = await findApprovalCheckbox(page);
  if (!checkbox) {
    throw new Error(`Approval checkbox not found. Visible checkbox context: ${await describeVisibleCheckboxes(page)}`);
  }

  const saveButton = await findSaveControl(page);
  if (!saveButton) {
    throw new Error("Save button not found.");
  }

  await checkbox.check();

  if (dryRun) {
    await cancelAndReturn(page);
    return;
  }

  await Promise.all([page.waitForLoadState("domcontentloaded"), saveButton.click()]);
  await returnToListAfterSave(page);
}
