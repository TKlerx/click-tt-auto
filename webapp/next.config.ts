import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { fileURLToPath } from "node:url";

const basePath = normalizeBasePath(process.env.BASE_PATH ?? "");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    // Playwright loads runtime assets such as browsers.json dynamically.
    "/*": [
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*",
    ],
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
