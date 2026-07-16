export default async function globalTeardown() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://starter:starter_e2e_password@localhost:45432/business_app_starter_e2e_test";
  if (!databaseUrl.startsWith("file:")) {
    return;
  }

  const databasePath = databaseUrl.replace(/^file:/, "");
  const fs = await import("node:fs");
  if (databasePath && fs.existsSync(databasePath)) {
    try {
      fs.rmSync(databasePath, { force: true });
    } catch {
      // Windows can briefly keep SQLite files locked while the app server shuts down.
    }
  }
}
