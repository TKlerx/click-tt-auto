import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role } from "../../generated/prisma/enums";

const { requireApiUser, requireApiUserWithRoles } = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  requireApiUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
  requireApiUserWithRoles,
}));

import { GET, POST } from "@/app/api/background-jobs/route";

describe("background jobs route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new background job for the current user", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });

    prismaMock.backgroundJob.create.mockResolvedValue({
      id: "job-1",
      jobType: "echo",
      status: "PENDING",
      payload: '{"message":"hello"}',
      result: null,
      error: null,
      attemptCount: 0,
      availableAt: new Date("2026-03-31T00:00:00Z"),
      startedAt: null,
      lockedAt: null,
      finishedAt: null,
      workerId: null,
      createdByUserId: "admin-1",
      createdAt: new Date("2026-03-31T00:00:00Z"),
      updatedAt: new Date("2026-03-31T00:00:00Z"),
    } as never);

    const response = await POST(
      new Request("http://localhost/api/background-jobs", {
        method: "POST",
        body: JSON.stringify({
          jobType: "echo",
          payload: { message: "hello" },
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    if (!response) {
      throw new Error("Expected response");
    }

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      job: {
        id: "job-1",
        jobType: "echo",
        status: "PENDING",
        payload: { message: "hello" },
      },
    });
  });

  it("rejects unsupported job types", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });

    const response = await POST(
      new Request("http://localhost/api/background-jobs", {
        method: "POST",
        body: JSON.stringify({
          jobType: "report",
          payload: { message: "hello" },
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    if (!response) {
      throw new Error("Expected response");
    }

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unsupported jobType",
    });
  });

  it("rejects oversized payloads", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });

    const response = await POST(
      new Request("http://localhost/api/background-jobs", {
        method: "POST",
        body: JSON.stringify({
          jobType: "echo",
          payload: { data: "x".repeat(11 * 1024) },
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    if (!response) {
      throw new Error("Expected response");
    }

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "payload exceeds 10KB limit",
    });
  });

  it("lists the current user's jobs", async () => {
    requireApiUser.mockResolvedValue({
      user: { id: "user-1", role: Role.SCOPE_USER },
    });

    prismaMock.backgroundJob.findMany.mockResolvedValue([
      {
        id: "job-1",
        jobType: "noop",
        status: "COMPLETED",
        payload: '{"delegatedAccessToken":"secret-token","safe":"ok"}',
        result: '{"accessToken":"secret","message":"done"}',
        error: null,
        attemptCount: 1,
        availableAt: new Date("2026-03-31T00:00:00Z"),
        startedAt: new Date("2026-03-31T00:00:01Z"),
        lockedAt: new Date("2026-03-31T00:00:01Z"),
        finishedAt: new Date("2026-03-31T00:00:02Z"),
        workerId: "worker-1",
        createdByUserId: "user-1",
        createdAt: new Date("2026-03-31T00:00:00Z"),
        updatedAt: new Date("2026-03-31T00:00:02Z"),
      },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/background-jobs"),
    );

    if (!response) {
      throw new Error("Expected response");
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobs: [
        {
          id: "job-1",
          jobType: "noop",
          status: "COMPLETED",
          payload: { delegatedAccessToken: "[REDACTED]", safe: "ok" },
          result: { accessToken: "[REDACTED]", message: "done" },
          workerId: "worker-1",
        },
      ],
    });
  });
});
