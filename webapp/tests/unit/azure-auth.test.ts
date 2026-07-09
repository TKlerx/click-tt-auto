import { describe, expect, it, vi } from "vitest";
import { getExternalOrigin } from "@/lib/azure-auth";

describe("azure auth origin resolution", () => {
  it("uses AUTH_BASE_URL when set", () => {
    vi.stubEnv("AUTH_BASE_URL", "https://example.com/base/");

    const origin = getExternalOrigin(
      new Request("http://internal.local/path", {
        headers: {
          "x-forwarded-host": "malicious.example",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(origin).toBe("https://example.com/base");
    vi.unstubAllEnvs();
  });

  it("falls back to the request origin when AUTH_BASE_URL is unset", () => {
    vi.stubEnv("AUTH_BASE_URL", "");

    const origin = getExternalOrigin(
      new Request("http://internal.local/path", {
        headers: {
          "x-forwarded-host": "malicious.example",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(origin).toBe("http://internal.local");
    vi.unstubAllEnvs();
  });

  it("handles trailing slashes in AUTH_BASE_URL", () => {
    vi.stubEnv("AUTH_BASE_URL", "https://app.example.com/");

    const origin = getExternalOrigin(new Request("http://internal.local/path"));

    expect(origin).toBe("https://app.example.com");
    vi.unstubAllEnvs();
  });
});
