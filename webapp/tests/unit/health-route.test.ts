import { afterEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseHealth, getProcessHealth } = vi.hoisted(() => ({
  checkDatabaseHealth: vi.fn(),
  getProcessHealth: vi.fn(),
}));

vi.mock("@/lib/monitoring", () => ({
  checkDatabaseHealth,
  getProcessHealth,
}));

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when all checks pass", async () => {
    checkDatabaseHealth.mockResolvedValue({ status: "ok" });
    getProcessHealth.mockReturnValue({
      status: "ok",
      uptimeSeconds: 10,
      nodeEnv: "test",
    });

    const response = await GET(
      new Request("http://localhost/api/health", {
        headers: { "x-request-id": "req-123" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      requestId: "req-123",
      checks: {
        database: { status: "ok" },
        process: { status: "ok" },
      },
    });
  });

  it("returns degraded when the database check fails", async () => {
    checkDatabaseHealth.mockResolvedValue({
      status: "error",
      message: "db down",
    });
    getProcessHealth.mockReturnValue({
      status: "ok",
      uptimeSeconds: 10,
      nodeEnv: "test",
    });

    const response = await GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      checks: {
        database: { status: "error" },
      },
    });
  });
});
