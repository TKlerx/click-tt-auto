import { afterEach, describe, expect, it } from "vitest";
import {
  getAppVersionInfo,
  getAppVersionLabel,
  resetAppVersionInfoForTests,
} from "@/lib/app-version";

const metadataKeys = [
  "APP_ENVIRONMENT",
  "APP_VERSION",
  "APP_REVISION",
  "APP_GIT_SHA",
  "APP_BUILD_ID",
  "APP_BUILT_AT",
];

describe("app version metadata", () => {
  afterEach(() => {
    for (const key of metadataKeys) {
      delete process.env[key];
    }
    resetAppVersionInfoForTests();
  });

  it("formats explicit deployment metadata for the UI badge", () => {
    process.env.APP_ENVIRONMENT = "staging";
    process.env.APP_VERSION = "staging-42";
    process.env.APP_REVISION = "abcdef1234567890";
    process.env.APP_BUILD_ID = "123.2";
    process.env.APP_BUILT_AT = "2026-06-11T09:20:17Z";

    expect(getAppVersionInfo()).toMatchObject({
      environment: "staging",
      version: "staging-42",
      revision: "abcdef1234567890",
      shortRevision: "abcdef123456",
      buildId: "123.2",
      builtAt: "2026-06-11T09:20:17Z",
      label: "staging | staging-42 | abcdef123456 | run 123.2",
    });
    expect(getAppVersionLabel()).toBe(
      "staging | staging-42 | abcdef123456 | run 123.2",
    );
  });

  it("falls back to package version and unknown revision without shelling out", () => {
    expect(getAppVersionInfo()).toMatchObject({
      environment: "local",
      version: "v1.0.0",
      revision: "unknown",
      shortRevision: "unknown",
      buildId: "unknown",
      builtAt: "unknown",
      label: "local | v1.0.0",
    });
  });

  it("accepts legacy APP_GIT_SHA as the revision fallback", () => {
    process.env.APP_GIT_SHA = "1122334455667788";

    expect(getAppVersionInfo()).toMatchObject({
      revision: "1122334455667788",
      shortRevision: "112233445566",
      label: "local | v1.0.0 | 112233445566",
    });
  });
});
