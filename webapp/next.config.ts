import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwrightRequire = createRequire(require.resolve("playwright"));
const browserRegistry = relative(
  dirname(fileURLToPath(import.meta.url)),
  join(
    dirname(playwrightRequire.resolve("playwright-core/package.json")),
    "browsers.json",
  ),
).replaceAll("\\", "/");

const basePath = normalizeBasePath(process.env.BASE_PATH ?? "");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  // Turbopack's standalone trace omits Playwright's dynamically loaded registry.
  // Resolve through playwright so pnpm's versioned store and npm both work.
  outputFileTracingIncludes: {
    "/*": [browserRegistry],
  },
  outputFileTracingExcludes: {
    "/*": ["./webapp/next.config.ts", "./next.config.ts"],
  },
  turbopack: {
    root: repoRoot,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default withNextIntl(nextConfig);

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}
