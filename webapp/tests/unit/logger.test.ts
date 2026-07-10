import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, sanitizeRequestQuery } from "@/lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts sensitive values", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const testLogger = createLogger({
      level: "info",
      baseMeta: { component: "test" },
    });

    testLogger.info("user.login", {
      authorization: "Bearer secret-token",
      nested: {
        password: "super-secret",
      },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      event: "user.login",
      component: "test",
      authorization: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
      },
    });
  });

  it("redacts sensitive key variants and identity fields", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const testLogger = createLogger({ level: "info" });

    testLogger.info("token.event", {
      actorId: "user_123",
      access_token: "abc",
      apiKey: "api-key",
      api_token: "api-token",
      authorization: "Bearer abc",
      client_secret: "client-secret",
      cookie: "session=abc",
      idToken: "id-token",
      password: "password",
      "refresh-token": "refresh-token",
      session_token: "session-token",
      tokenValue: "def",
      userEmail: "person@example.com",
      displayName: "Person Example",
    });

    const payload = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(payload.actorId).toBe("user_123");
    expect(payload.access_token).toBe("[REDACTED]");
    expect(payload.apiKey).toBe("[REDACTED]");
    expect(payload.api_token).toBe("[REDACTED]");
    expect(payload.authorization).toBe("[REDACTED]");
    expect(payload.client_secret).toBe("[REDACTED]");
    expect(payload.cookie).toBe("[REDACTED]");
    expect(payload.idToken).toBe("[REDACTED]");
    expect(payload.password).toBe("[REDACTED]");
    expect(payload["refresh-token"]).toBe("[REDACTED]");
    expect(payload.session_token).toBe("[REDACTED]");
    expect(payload.tokenValue).toBe("[REDACTED]");
    expect(payload.userEmail).toBe("[REDACTED]");
    expect(payload.displayName).toBe("[REDACTED]");
    expect(String(infoSpy.mock.calls[0][0])).not.toContain(
      "person@example.com",
    );
  });

  it("filters logs below the configured level", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const testLogger = createLogger({ level: "warn" });

    testLogger.debug("debug.message");
    testLogger.warn("warn.message");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("truncates deep metadata and handles log sink failures", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    const testLogger = createLogger({ level: "info" });

    expect(() =>
      testLogger.info("deep.event", {
        nested: { a: { b: { c: { d: { e: "hidden" } } } } },
        bigint: 10n,
      }),
    ).not.toThrow();

    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it("allowlists request query fields", () => {
    const params = new URLSearchParams(
      "page=1&token=secret&email=person%40example.com&sort=createdAt",
    );

    expect(sanitizeRequestQuery(params, ["page", "sort"])).toEqual({
      page: "1",
      sort: "createdAt",
    });
  });
});
