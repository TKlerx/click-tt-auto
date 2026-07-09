import { describe, expect, it } from "vitest";

const SENSITIVE_KEYS = [
  "delegatedAccessToken",
  "accessToken",
  "refreshToken",
  "authorization",
  "token",
  "apiKey",
] as const;

const TOKEN_SHAPES = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
  "Bearer eyJraWQiOiJrMSJ9.payload.signature",
  "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
] as const;

describe("security redaction fixtures", () => {
  it("keeps a stable sensitive key fixture list", () => {
    expect(SENSITIVE_KEYS).toEqual(
      expect.arrayContaining([
        "delegatedAccessToken",
        "authorization",
        "apiKey",
      ]),
    );
  });

  it("keeps representative token-like fixture values", () => {
    expect(TOKEN_SHAPES.length).toBeGreaterThanOrEqual(3);
  });
});
