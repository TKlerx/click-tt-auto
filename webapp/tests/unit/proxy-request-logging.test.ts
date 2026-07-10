import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/azure-auth", () => ({
  getScopedCookiePath: () => "/starter",
}));

vi.mock("@/lib/better-auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
  getBetterAuthCookieNames: () => ["better-auth.session_token"],
}));

function createRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe("proxy request logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not emit request logs by default", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { proxy } = await import("@/proxy");

    const response = await proxy(
      createRequest("https://example.test/login?token=secret", {
        "x-request-id": "req-123",
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("req-123");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("emits opt-in request completion logs with proxy-visible status and duration", async () => {
    vi.stubEnv("ENABLE_REQUEST_LOGGING", "true");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { proxy } = await import("@/proxy");

    const response = await proxy(
      createRequest("https://example.test/login?page=1&token=secret", {
        "x-request-id": "req-456",
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("req-456");
    expect(infoSpy).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      event: "http.request.completed",
      component: "proxy",
      requestId: "req-456",
      method: "GET",
      path: "/login",
      status: 200,
    });
    expect(typeof payload.durationMs).toBe("number");
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(String(infoSpy.mock.calls[0][0])).not.toContain("token=secret");
  });

  it("logs only allowlisted request query fields", async () => {
    vi.stubEnv("ENABLE_REQUEST_LOGGING", "true");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { proxy } = await import("@/proxy");

    await proxy(
      createRequest(
        "https://example.test/login?page=1&sort=createdAt&email=person%40example.com",
        {
          "x-request-id": "req-789",
        },
      ),
    );

    const payload = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      path: "/login",
      query: {
        page: "1",
        sort: "createdAt",
      },
    });
    expect(String(infoSpy.mock.calls[0][0])).not.toContain(
      "person@example.com",
    );
    expect(String(infoSpy.mock.calls[0][0])).not.toContain("email");
  });
});
