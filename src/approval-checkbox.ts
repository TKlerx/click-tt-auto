import { normalizeWhitespace } from "./dom.js";

type QueryRoot = Document | Element;

export function isApprovalCheckboxText(value: string | null | undefined): boolean {
  return /spielbericht genehmigt/i.test(normalizeWhitespace(value));
}

function getAssociatedLabelText(root: QueryRoot, checkbox: Element): string {
  const checkboxId = checkbox.getAttribute("id");
  if (!checkboxId) {
    return "";
  }

  const matchingLabel = Array.from(root.querySelectorAll("label")).find((label) => label.htmlFor === checkboxId);
  return normalizeWhitespace(matchingLabel?.textContent);
}

export function getCheckboxContextText(root: QueryRoot, checkbox: Element): string {
  const parts = [
    checkbox.getAttribute("aria-label"),
    getAssociatedLabelText(root, checkbox),
    checkbox.parentElement?.textContent,
    checkbox.closest("label, p, td, div, span")?.textContent,
    checkbox.previousSibling?.textContent,
    checkbox.nextSibling?.textContent
  ]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  return normalizeWhitespace(
    Array.from(new Set(parts)).join(" ")
  );
}

export function hasApprovalCheckbox(root: QueryRoot): boolean {
  return Array.from(root.querySelectorAll('input[type="checkbox"]')).some((checkbox) =>
    isApprovalCheckboxText(getCheckboxContextText(root, checkbox))
  );
}

export function isApprovalCheckboxChecked(root: QueryRoot): boolean {
  return Array.from(root.querySelectorAll('input[type="checkbox"]')).some(
    (checkbox) =>
      isApprovalCheckboxText(getCheckboxContextText(root, checkbox)) && checkbox.hasAttribute("checked")
  );
}

export function listCheckboxContextTexts(root: QueryRoot): string[] {
  return Array.from(root.querySelectorAll('input[type="checkbox"]'))
    .map((checkbox) => getCheckboxContextText(root, checkbox))
    .filter(Boolean);
}
