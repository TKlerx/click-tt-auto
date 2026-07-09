const LOCAL_DATABASE_URL = "file:./dev.db";
type DatabaseUrlEnv = Record<string, string | undefined>;

function firstConfiguredValue(values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return LOCAL_DATABASE_URL;
}

export function resolveAppDatabaseUrl(env: DatabaseUrlEnv = process.env) {
  return firstConfiguredValue([env.APP_DATABASE_URL, env.DATABASE_URL]);
}

export function resolveMigrationDatabaseUrl(env: DatabaseUrlEnv = process.env) {
  return firstConfiguredValue([env.MIGRATION_DATABASE_URL, env.DATABASE_URL]);
}

export function getDatabaseProviderForUrl(databaseUrl: string) {
  return databaseUrl.startsWith("file:") ? "sqlite" : "postgresql";
}
