import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { Role } from "../../generated/prisma/enums";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const { getTranslations } = vi.hoisted(() => ({
  getTranslations: vi.fn(),
}));

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const { prisma } = vi.hoisted(() => ({
  prisma: {
    backgroundJob: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("next-intl/server", () => ({
  getTranslations,
}));

vi.mock("@/lib/auth", () => ({
  requireSession,
}));

vi.mock("@/lib/db", () => ({
  prisma,
}));

import BackgroundJobsPage from "@/app/(dashboard)/background-jobs/page";

describe("background jobs dashboard page", () => {
  afterEach(() => {
    vi.clearAllMocks();
    getTranslations.mockResolvedValue(
      (
        key: string,
        values?: { count?: number; attempt?: number; time?: string },
      ) => {
        if (key === "showingRecent") {
          return `Showing the latest ${values?.count ?? 0} jobs`;
        }

        if (key === "retryScheduled") {
          return `Retry ${values?.attempt ?? 0} at ${values?.time ?? ""}`;
        }

        return key;
      },
    );
  });

  it("redirects non-admin users back to the dashboard", async () => {
    requireSession.mockResolvedValue({
      id: "user-1",
      role: Role.SCOPE_USER,
    });

    await expect(BackgroundJobsPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(prisma.backgroundJob.findMany).not.toHaveBeenCalled();
  });

  it("renders recent jobs for platform admins", async () => {
    requireSession.mockResolvedValue({
      id: "admin-1",
      role: Role.PLATFORM_ADMIN,
    });

    prisma.backgroundJob.findMany.mockResolvedValue([
      {
        id: "job-1",
        jobType: "echo",
        status: "PENDING",
        payload: '{"message":"hello","delegatedAccessToken":"secret-token"}',
        result: null,
        error: "boom",
        attemptCount: 2,
        availableAt: new Date("2026-03-31T10:05:00Z"),
        createdAt: new Date("2026-03-31T10:00:00Z"),
        updatedAt: new Date("2026-03-31T10:01:00Z"),
        workerId: null,
        createdBy: {
          name: "Admin User",
          email: "admin@example.com",
        },
      },
      {
        id: "job-2",
        jobType: "noop",
        status: "COMPLETED",
        payload: "{}",
        result: '{"message":"done"}',
        error: null,
        attemptCount: 1,
        availableAt: new Date("2026-03-31T09:00:00Z"),
        createdAt: new Date("2026-03-31T09:00:00Z"),
        updatedAt: new Date("2026-03-31T09:01:00Z"),
        workerId: "worker-1",
        createdBy: null,
      },
    ]);

    const page = await BackgroundJobsPage();
    const text = collectText(page).join(" ");

    expect(prisma.backgroundJob.findMany).toHaveBeenCalledWith({
      include: {
        createdBy: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    expect(text).toContain("echo");
    expect(text).toContain("noop");
    expect(text).toContain("PENDING");
    expect(text).toContain("COMPLETED");
    expect(text).toContain("Admin User");
    expect(text).toContain("boom");
    expect(text).toContain("Retry 3 at");
    expect(text).toContain("Showing the latest 2 jobs");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("secret-token");
  });
});

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;

    if (typeof element.type === "function") {
      const render = element.type as (props: typeof element.props) => ReactNode;
      return collectText(render(element.props));
    }

    return collectText(element.props.children);
  }

  return [];
}
