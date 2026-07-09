import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { checkDatabaseHealth } from "@/lib/monitoring";

describe("monitoring", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a generic failure message when the database health check fails", async () => {
    prismaMock.$queryRaw.mockRejectedValue(
      new Error("dial tcp 10.0.0.1:5432: i/o timeout"),
    );

    const health = await checkDatabaseHealth();

    expect(health).toEqual({
      status: "error",
      message: "Database health check failed",
    });
  });
});
