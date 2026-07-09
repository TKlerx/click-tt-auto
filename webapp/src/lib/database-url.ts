type DatabaseUrlEnv = Record<string, string | undefined>;

function firstConfiguredValue(values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  throw new Error("APP_DATABASE_URL or DATABASE_URL must be set.");
}

export function resolveAppDatabaseUrl(env: DatabaseUrlEnv = process.env) {
  return firstConfiguredValue([env.APP_DATABASE_URL, env.DATABASE_URL]);
}

export function resolveMigrationDatabaseUrl(env: DatabaseUrlEnv = process.env) {
  return firstConfiguredValue([env.MIGRATION_DATABASE_URL, env.DATABASE_URL]);
}

export function getDatabaseProviderForUrl(
  databaseUrl: string,
): "postgresql" {
  if (
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    throw new Error("Only PostgreSQL database URLs are supported.");
  }

  return "postgresql";
}
