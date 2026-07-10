import { afterEach, describe, expect, it, vi } from "vitest";

const { requireApiUserWithRoles } = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
}));

const { cookies } = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const {
  createTeamsConsentState,
  getTeamsConsentAppRedirectPath,
  getTeamsAuthorizeUrl,
  getTeamsConsentCookiePath,
  TEAMS_CONSENT_STATE_COOKIE,
} = vi.hoisted(() => ({
  createTeamsConsentState: vi.fn(() => "state-123"),
  getTeamsConsentAppRedirectPath: vi.fn((path: string) => path),
  getTeamsAuthorizeUrl: vi.fn(
    () => new URL("https://login.microsoftonline.com/authorize"),
  ),
  getTeamsConsentCookiePath: vi.fn(() => "/"),
  TEAMS_CONSENT_STATE_COOKIE: "starter_app_teams_consent_state",
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("@/services/teams/consent", () => ({
  createTeamsConsentState,
  getTeamsConsentAppRedirectPath,
  getTeamsAuthorizeUrl,
  getTeamsConsentCookiePath,
  TEAMS_CONSENT_STATE_COOKIE,
}));

import { GET } from "@/app/api/integrations/teams/consent/start/route";

describe("teams consent start route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to default redirect for backslash-based redirect input", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1" },
    });
    const setCookie = vi.fn();
    cookies.mockResolvedValue({
      set: setCookie,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/integrations/teams/consent/start?redirectTo=/\\evil.com",
      ),
    );

    expect(response.status).toBe(307);
    expect(setCookie).toHaveBeenCalledWith(
      TEAMS_CONSENT_STATE_COOKIE,
      "state-123:/admin/integrations/teams",
      expect.objectContaining({
        path: "/",
      }),
    );
  });
});
