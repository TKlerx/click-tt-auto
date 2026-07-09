import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRateLimitStore,
  checkRateLimit,
  getClientIp,
} from "@/lib/rate-limit";

const TRUSTED_PROXY_FIXTURE = {
  spoofedForwardedFor: "203.0.113.10, 10.0.0.5",
  trustedClientIp: "203.0.113.10",
  trustedRealIp: "198.51.100.3",
};

describe("rate limit utility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T10:00:00Z"));
    __resetRateLimitStore();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    __resetRateLimitStore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows five attempts and blocks the sixth", () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(checkRateLimit("127.0.0.1", "login")).toEqual({
        allowed: true,
        retryAfterMs: 0,
      });
    }

    const blocked = checkRateLimit("127.0.0.1", "login");

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(15 * 60 * 1000);
  });

  it("resets after the window expires", () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      checkRateLimit("127.0.0.1", "login");
    }

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(checkRateLimit("127.0.0.1", "login")).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
  });

  it("tracks endpoints independently", () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      checkRateLimit("127.0.0.1", "login");
    }

    expect(checkRateLimit("127.0.0.1", "change-password")).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
  });

  it("ignores proxy headers by default", () => {
    const forwardedRequest = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": TRUSTED_PROXY_FIXTURE.spoofedForwardedFor,
        "x-real-ip": TRUSTED_PROXY_FIXTURE.trustedRealIp,
      },
    });

    expect(getClientIp(forwardedRequest)).toBe("unknown");
  });

  it("extracts the client IP from the trusted proxy real-ip header when enabled", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "1");
    vi.stubEnv("TRUST_PROXY_HEADER_SECRET", "proxy-secret");

    const forwardedRequest = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": TRUSTED_PROXY_FIXTURE.spoofedForwardedFor,
        "x-real-ip": TRUSTED_PROXY_FIXTURE.trustedRealIp,
        "x-trusted-proxy-secret": "proxy-secret",
      },
    });
    const realIpRequest = new Request("http://localhost/test", {
      headers: {
        "x-real-ip": TRUSTED_PROXY_FIXTURE.trustedRealIp,
        "x-trusted-proxy-secret": "proxy-secret",
      },
    });
    const unknownRequest = new Request("http://localhost/test");

    expect(getClientIp(forwardedRequest)).toBe(
      TRUSTED_PROXY_FIXTURE.trustedRealIp,
    );
    expect(getClientIp(realIpRequest)).toBe(
      TRUSTED_PROXY_FIXTURE.trustedRealIp,
    );
    expect(getClientIp(unknownRequest)).toBe("unknown");
  });

  it("ignores spoofable forwarded-for chains in trusted proxy mode", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "1");
    vi.stubEnv("TRUST_PROXY_HEADER_SECRET", "proxy-secret");

    const request = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": TRUSTED_PROXY_FIXTURE.spoofedForwardedFor,
        "x-trusted-proxy-secret": "proxy-secret",
      },
    });

    expect(getClientIp(request)).toBe("unknown");
  });

  it("ignores malformed forwarded headers in trusted proxy mode", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "1");
    vi.stubEnv("TRUST_PROXY_HEADER_SECRET", "proxy-secret");

    const request = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": "not-an-ip",
        "x-real-ip": "198.51.100.7",
        "x-trusted-proxy-secret": "proxy-secret",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.7");
  });

  it("ignores forwarded headers when the trusted proxy secret is missing", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "1");
    vi.stubEnv("TRUST_PROXY_HEADER_SECRET", "proxy-secret");

    const request = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": TRUSTED_PROXY_FIXTURE.spoofedForwardedFor,
        "x-real-ip": TRUSTED_PROXY_FIXTURE.trustedRealIp,
      },
    });

    expect(getClientIp(request)).toBe("unknown");
  });

  it("keeps trusted-proxy fixture expectations explicit", () => {
    expect(TRUSTED_PROXY_FIXTURE).toMatchObject({
      spoofedForwardedFor: expect.stringContaining(","),
      trustedClientIp: "203.0.113.10",
      trustedRealIp: "198.51.100.3",
    });
  });

  it("ignores E2E disable flag in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_DISABLE_RATE_LIMIT", "1");

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(checkRateLimit("127.0.0.1", "login")).toEqual({
        allowed: true,
        retryAfterMs: 0,
      });
    }

    const blocked = checkRateLimit("127.0.0.1", "login");
    expect(blocked.allowed).toBe(false);
  });
});
