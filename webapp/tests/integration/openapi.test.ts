import { afterEach, describe, expect, it, vi } from "vitest";

const { requireApiUser } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

import { GET } from "@/app/api/openapi/route";

describe("openapi route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.BASE_PATH;
  });

  it("returns yaml with the configured base path and token endpoint groups", async () => {
    process.env.BASE_PATH = "/app-starter";
    requireApiUser.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });

    const response = await GET(new Request("http://localhost/api/openapi"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/yaml");
    const body = await response.text();
    expect(body).toContain("url: /app-starter");
    expect(body).toContain("/api/tokens:");
    expect(body).toContain("/api/admin/tokens:");
    expect(body).toContain("/api/cli-auth/authorize:");
  });
});
