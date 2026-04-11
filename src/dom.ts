import { JSDOM, VirtualConsole } from "jsdom";
import type { ConstructorOptions } from "jsdom";

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
  if (/Could not parse CSS stylesheet/i.test(error.message)) {
    return;
  }

  console.error(error.message);
});

const jsdomOptions: ConstructorOptions = { virtualConsole };
const JSDOMConstructor = JSDOM as unknown as new (html?: string, options?: ConstructorOptions) => JSDOM;

export function createDocument(html: string): Document {
  return new JSDOMConstructor(html, jsdomOptions).window.document;
}

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeForSearch(value: string | null | undefined): string {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
