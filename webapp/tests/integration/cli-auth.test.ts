import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitStore } from "@/lib/rate-limit";

const {
  getAbsoluteAppUrl,
  createAuthCode,
  exchangeAuthCode,
  cleanupExpiredCodes,
} = vi.hoisted(() => ({
  getAbsoluteAppUrl: vi.fn(
    (path: string) => `http://localhost:3280/app-starter${path}`,
  ),
  createAuthCode: vi.fn(),
  exchangeAuthCode: vi.fn(),
  cleanupExpiredCodes: vi.fn(),
}));

vi.mock("@/lib/better-auth-route", () => ({
  getAbsoluteAppUrl,
}));

vi.mock("@/services/api/cli-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/api/cli-auth")
  >("@/services/api/cli-auth");
  return {
    ...actual,
    createAuthCode,
    exchangeAuthCode,
    cleanupExpiredCodes,
  };
});

import { GET as authorizeCliAuth } from "@/app/api/cli-auth/authorize/route";
import { POST as exchangeCliAuth } from "@/app/api/cli-auth/token/route";

describe("cli auth routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    __resetRateLimitStore();
  });

  it("redirects valid localhost callback requests into the login flow", async () => {
    createAuthCode.mockResolvedValue({
      id: "cli-request-1",
      expiresAt: new Date("2026-06-10T12:00:00.000Z"),
    });

    const response = await authorizeCliAuth(
      new Request(
        "http://localhost/api/cli-auth/authorize?callback_url=http://localhost:4545/callback&state=state-123",
      ),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain(
      "http://localhost:3280/app-starter/login?redirectTo=",
    );
    const redirectTo = new URL(location!).searchParams.get("redirectTo");
    expect(redirectTo).toMatch(/^\/cli-login\?request=cli-request-1&approval=/);
    expect(response.headers.get("set-cookie")).toContain(
      "starter_app_cli_auth_csrf=",
    );
    expect(cleanupExpiredCodes).toHaveBeenCalledOnce();
  });

  it("rejects non-localhost callback URLs and missing state", async () => {
    const invalidCallbackResponse = await authorizeCliAuth(
      new Request(
        "http://localhost/api/cli-auth/authorize?callback_url=https://example.com/callback&state=state-123",
      ),
    );
    expect(invalidCallbackResponse.status).toBe(400);

    const missingStateResponse = await authorizeCliAuth(
      new Request(
        "http://localhost/api/cli-auth/authorize?callback_url=http://localhost:4545/callback",
      ),
    );
    expect(missingStateResponse.status).toBe(400);
  });

  it("exchanges valid codes and rejects expired, reused, or mismatched codes", async () => {
    cleanupExpiredCodes.mockResolvedValue(undefined);
    exchangeAuthCode
      .mockResolvedValueOnce({
        token: "starter_pat_cli_token",
        expiresAt: "2026-05-10T12:00:00.000Z",
        user: {
          name: "CLI User",
          email: "cli@example.com",
          role: "SCOPE_USER",
        },
      })
      .mockResolvedValueOnce({
        error: Response.json(
          { error: "Invalid or expired authorization code" },
          { status: 400 },
        ),
      })
      .mockResolvedValueOnce({
        error: Response.json(
          { error: "Invalid or expired authorization code" },
          { status: 400 },
        ),
      })
      .mockResolvedValueOnce({
        error: Response.json(
          { error: "Invalid or expired authorization code" },
          { status: 400 },
        ),
      });

    const successResponse = await exchangeCliAuth(
      new Request("http://localhost/api/cli-auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "valid-code", state: "state-123" }),
      }),
    );

    if (!successResponse) {
      throw new Error("Expected success response");
    }
    expect(successResponse.status).toBe(200);
    await expect(successResponse.json()).resolves.toMatchObject({
      token: "starter_pat_cli_token",
      user: {
        email: "cli@example.com",
      },
    });

    for (const code of ["expired-code", "reused-code", "state-mismatch"]) {
      const response = await exchangeCliAuth(
        new Request("http://localhost/api/cli-auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, state: "state-123" }),
        }),
      );

      if (!response) {
        throw new Error(`Expected response for ${code}`);
      }
      expect(response.status).toBe(400);
    }
  });

  it("does not use one shared unknown-client bucket for authorize requests", async () => {
    createAuthCode.mockResolvedValue({
      id: "cli-request-rl",
      expiresAt: new Date("2026-06-10T12:00:00.000Z"),
    });

    let blockedResponse: Response | undefined;
    for (let index = 0; index < 21; index += 1) {
      blockedResponse = await authorizeCliAuth(
        new Request(
          "http://localhost/api/cli-auth/authorize?callback_url=http://localhost:4545/callback&state=state-a",
        ),
      );
    }

    expect(blockedResponse?.status).toBe(429);

    const otherStateResponse = await authorizeCliAuth(
      new Request(
        "http://localhost/api/cli-auth/authorize?callback_url=http://localhost:4545/callback&state=state-b",
      ),
    );

    expect(otherStateResponse.status).toBe(307);
  });

  it("does not use one shared unknown-client bucket for token exchange", async () => {
    cleanupExpiredCodes.mockResolvedValue(undefined);
    exchangeAuthCode.mockResolvedValue({
      error: Response.json(
        { error: "Invalid or expired authorization code" },
        { status: 400 },
      ),
    });

    let blockedResponse: Response | undefined;
    for (let index = 0; index < 6; index += 1) {
      blockedResponse = await exchangeCliAuth(
        new Request("http://localhost/api/cli-auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: "same-code", state: "state-123" }),
        }),
      );
    }

    expect(blockedResponse?.status).toBe(429);

    const otherCodeResponse = await exchangeCliAuth(
      new Request("http://localhost/api/cli-auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "other-code", state: "state-123" }),
      }),
    );

    expect(otherCodeResponse?.status).toBe(400);
  });
});
