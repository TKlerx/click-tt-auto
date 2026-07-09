import { afterEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUserWithRoles } = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
}));

const { buildOpsHealthSnapshot } = vi.hoisted(() => ({
  buildOpsHealthSnapshot: vi.fn(),
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

vi.mock("@/lib/ops-health", () => ({
  buildOpsHealthSnapshot,
}));

import { GET } from "@/app/api/admin/ops-health/route";

describe("ops health admin API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires platform admin access", async () => {
    const forbidden = Response.json(
      { error: "Not authorized" },
      { status: 403 },
    );
    requireApiUserWithRoles.mockResolvedValue({ error: forbidden });

    const response = await GET(
      new Request("http://localhost/api/admin/ops-health"),
    );

    expect(response.status).toBe(403);
    expect(requireApiUserWithRoles).toHaveBeenCalledWith(
      [Role.PLATFORM_ADMIN],
      expect.any(Request),
    );
  });

  it("returns a safe health snapshot for admins", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    buildOpsHealthSnapshot.mockResolvedValue({
      capturedAt: "2026-06-11T09:30:00Z",
      overallStatus: "healthy",
      environment: {
        environment: "staging",
        version: "staging-42",
        revision: "abcdef123456",
        buildId: "123.2",
        builtAt: "2026-06-11T09:00:00Z",
      },
      checks: [
        {
          key: "database",
          status: "healthy",
          summary: "Database connectivity check passed",
        },
      ],
      diagnosticSummary: {
        generatedAt: "2026-06-11T09:30:00Z",
        text: "Environment: staging\nDatabase: healthy",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/ops-health"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      overallStatus: "healthy",
      environment: {
        version: "staging-42",
      },
      diagnosticSummary: {
        text: expect.not.stringContaining("secret"),
      },
    });
  });

  it("returns a safe fatal error when snapshot assembly fails", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    buildOpsHealthSnapshot.mockRejectedValue(
      new Error("postgresql://user:pass@example/db"),
    );

    const response = await GET(
      new Request("http://localhost/api/admin/ops-health"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Could not assemble a safe ops health snapshot",
    });
    expect(JSON.stringify(body)).not.toContain("postgresql://");
  });
});
