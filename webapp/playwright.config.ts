import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? "3280");
const normalizedBasePath = process.env.E2E_BASE_PATH ?? "/app-starter";
const authBaseUrl = `http://localhost:${port}${normalizedBasePath}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://starter:starter_e2e_password@localhost:55432/business_app_starter_e2e_test";
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "1";

process.env.E2E_PORT = String(port);
process.env.E2E_BASE_PATH = normalizedBasePath;
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  globalSetup: "./tests/e2e/global.setup.ts",
  globalTeardown: "./tests/e2e/global.teardown.ts",
  use: {
    baseURL: authBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm run prisma:generate:postgres && pnpm run build && pnpm run start",
    env: {
      ...process.env,
      PORT: String(port),
      BASE_PATH: normalizedBasePath,
      DATABASE_URL: databaseUrl,
      AUTH_BASE_URL: process.env.AUTH_BASE_URL ?? authBaseUrl,
      E2E_BASE_PATH: normalizedBasePath,
      INITIAL_ADMIN_EMAIL:
        process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com",
      INITIAL_ADMIN_PASSWORD:
        process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!",
      BETTERAUTH_SECRET:
        process.env.BETTERAUTH_SECRET ??
        "e2e-test-secret-not-for-production-use-only",
      E2E_TESTING: "1",
      E2E_MOCK_SSO: "1",
      E2E_MOCK_SSO_SECRET:
        process.env.E2E_MOCK_SSO_SECRET ?? "e2e-mock-sso-secret",
      E2E_DISABLE_RATE_LIMIT: "1",
      AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID ?? "replace-me",
      AZURE_AD_CLIENT_SECRET:
        process.env.AZURE_AD_CLIENT_SECRET ?? "replace-me",
      AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID ?? "replace-me",
    },
    port,
    timeout: 240 * 1000,
    reuseExistingServer,
  },
});
