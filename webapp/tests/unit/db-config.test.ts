import { describe, expect, it } from "vitest";

import {
  getDatabaseProviderForUrl,
  resolveAppDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from "@/lib/database-url";

describe("database URL resolution", () => {
  it("prefers APP_DATABASE_URL for app runtime", () => {
    expect(
      resolveAppDatabaseUrl({
        APP_DATABASE_URL: "postgresql://app:test@localhost:5432/app",
        DATABASE_URL: "postgresql://legacy:test@localhost:5432/app",
      }),
    ).toBe("postgresql://app:test@localhost:5432/app");
  });

  it("falls back to DATABASE_URL for local app runtime", () => {
    expect(resolveAppDatabaseUrl({ DATABASE_URL: "file:./dev.db" })).toBe(
      "file:./dev.db",
    );
  });

  it("defaults to local SQLite when no app database URL is configured", () => {
    expect(resolveAppDatabaseUrl({})).toBe("file:./dev.db");
  });

  it("prefers MIGRATION_DATABASE_URL for migration runtime", () => {
    expect(
      resolveMigrationDatabaseUrl({
        MIGRATION_DATABASE_URL: "postgresql://migrator:test@localhost:5432/app",
        DATABASE_URL: "postgresql://legacy:test@localhost:5432/app",
      }),
    ).toBe("postgresql://migrator:test@localhost:5432/app");
  });

  it("detects Prisma provider from the selected URL", () => {
    expect(getDatabaseProviderForUrl("file:./dev.db")).toBe("sqlite");
    expect(getDatabaseProviderForUrl("postgresql://app:test@db:5432/app")).toBe(
      "postgresql",
    );
  });
});
