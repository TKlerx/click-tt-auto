import { spawnSync } from "node:child_process";

const defaultE2eDatabaseUrl =
  "postgresql://starter:starter_e2e_password@localhost:45432/business_app_starter_e2e_test";

export default async function globalSetup() {
  const env = {
    ...process.env,
    APP_DATABASE_URL: process.env.DATABASE_URL ?? defaultE2eDatabaseUrl,
    DATABASE_URL: process.env.DATABASE_URL ?? defaultE2eDatabaseUrl,
    MIGRATION_DATABASE_URL: process.env.DATABASE_URL ?? defaultE2eDatabaseUrl,
    INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com",
    INITIAL_ADMIN_PASSWORD:
      process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!",
  };

  const result = spawnSync(process.execPath, ["scripts/ensure-e2e-db.mjs"], {
    stdio: "inherit",
    env,
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error("Failed to provision the E2E database.");
  }
}
