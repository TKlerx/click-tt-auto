import { describe, expect, it } from "vitest";
import {
  DEFAULT_E2E_DATABASE_URL,
  resolveE2eDatabaseUrl,
} from "../../scripts/e2e-database-url.mjs";

describe("resolveE2eDatabaseUrl", () => {
  // The whole point: E2E resets its database, so it must never inherit
  // DATABASE_URL, which may be a real or production database.
  it("ignores DATABASE_URL", () => {
    expect(
      resolveE2eDatabaseUrl({
        DATABASE_URL: "postgresql://prod-host:5432/production",
      }),
    ).toBe(DEFAULT_E2E_DATABASE_URL);
  });

  it("uses E2E_DATABASE_URL when set, even alongside DATABASE_URL", () => {
    expect(
      resolveE2eDatabaseUrl({
        E2E_DATABASE_URL: "postgresql://e2e-host:5432/e2e",
        DATABASE_URL: "postgresql://prod-host:5432/production",
      }),
    ).toBe("postgresql://e2e-host:5432/e2e");
  });

  it("falls back to the throwaway local default", () => {
    expect(resolveE2eDatabaseUrl({})).toBe(DEFAULT_E2E_DATABASE_URL);
  });

  it("treats a blank E2E_DATABASE_URL as unset", () => {
    expect(
      resolveE2eDatabaseUrl({
        E2E_DATABASE_URL: "   ",
        DATABASE_URL: "postgresql://prod-host:5432/production",
      }),
    ).toBe(DEFAULT_E2E_DATABASE_URL);
  });
});
