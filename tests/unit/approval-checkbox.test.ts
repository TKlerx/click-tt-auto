import { describe, expect, it } from "vitest";
import {
  getCheckboxContextText,
  hasApprovalCheckbox,
  isApprovalCheckboxChecked,
  isApprovalCheckboxText,
  listCheckboxContextTexts
} from "../../src/approval-checkbox.js";
import { createDocument } from "../../src/dom.js";

describe("approval checkbox helpers", () => {
  it("recognizes the approval checkbox from an inline parent text node", () => {
    const document = createDocument(`
      <html>
        <body>
          <p><input type="checkbox" name="approval" />Spielbericht genehmigt</p>
        </body>
      </html>
    `);

    const checkbox = document.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(isApprovalCheckboxText(getCheckboxContextText(document, checkbox!))).toBe(true);
    expect(hasApprovalCheckbox(document)).toBe(true);
  });

  it("recognizes the approval checkbox from a linked label", () => {
    const document = createDocument(`
      <html>
        <body>
          <label for="approval">Spielbericht genehmigt</label>
          <input id="approval" type="checkbox" checked />
        </body>
      </html>
    `);

    expect(hasApprovalCheckbox(document)).toBe(true);
    expect(isApprovalCheckboxChecked(document)).toBe(true);
  });

  it("does not match unrelated checkbox text", () => {
    const document = createDocument(`
      <html>
        <body>
          <p><input type="checkbox" />nur noch nicht genehmigte Begegnungen anzeigen</p>
        </body>
      </html>
    `);

    expect(hasApprovalCheckbox(document)).toBe(false);
    expect(listCheckboxContextTexts(document)).toEqual(["nur noch nicht genehmigte Begegnungen anzeigen"]);
  });
});
