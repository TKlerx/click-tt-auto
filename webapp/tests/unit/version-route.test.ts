import { afterEach, describe, expect, it } from "vitest";
import { resetAppVersionInfoForTests } from "@/lib/app-version";
import { GET } from "@/app/api/version/route";

describe("version route", () => {
  afterEach(() => {
    delete process.env.APP_ENVIRONMENT;
    delete process.env.APP_VERSION;
    delete process.env.APP_REVISION;
    delete process.env.APP_BUILD_ID;
    delete process.env.APP_BUILT_AT;
    resetAppVersionInfoForTests();
  });

  it("returns non-secret build metadata", async () => {
    process.env.APP_ENVIRONMENT = "dev";
    process.env.APP_VERSION = "dev-17";
    process.env.APP_REVISION = "abcdef123456";
    process.env.APP_BUILD_ID = "987.1";
    process.env.APP_BUILT_AT = "2026-06-11T09:20:17Z";

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      environment: "dev",
      version: "dev-17",
      revision: "abcdef123456",
      shortRevision: "abcdef123456",
      buildId: "987.1",
      builtAt: "2026-06-11T09:20:17Z",
      label: "dev | dev-17 | abcdef123456 | run 987.1",
    });
  });
});
