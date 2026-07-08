import fs from "node:fs/promises";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";

export async function extractPdfText(filePath: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter((item): item is TextItem => "str" in item)
        .map((item) => item.str)
        .join(" ")
    );
  }

  return pages.join("\n");
}
