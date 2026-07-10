import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { AuditAction, Role } from "../../generated/prisma/enums";

const { requireApiUserWithRoles } = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

import { exportToCSV, exportToPDF } from "@/lib/audit-export";
import { GET } from "@/app/api/audit/route";
import { GET as exportGET } from "@/app/api/audit/export/route";

const AUDIT_BOUNDS_FIXTURE = {
  defaultPage: 1,
  defaultLimit: 25,
  expectedApiLimit: 10,
};

describe("audit export", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports CSV with the expected fields", async () => {
    prismaMock.auditEntry.count.mockResolvedValue(1);
    prismaMock.auditEntry.findMany.mockResolvedValue([
      {
        id: "audit-1",
        action: AuditAction.USER_CREATED,
        entityType: "user",
        entityId: "user-1",
        details: '{"role":"SCOPE_USER"}',
        createdAt: new Date("2026-03-21T00:00:00Z"),
        actor: {
          id: "user-1",
          name: "Audit Admin",
          email: "audit@example.com",
          role: Role.PLATFORM_ADMIN,
        },
        scope: {
          id: "scope-1",
          name: "Kenya",
          code: "KE",
        },
      },
    ] as never);

    const csv = await exportToCSV();

    expect(csv.buffer.toString("utf8")).toContain("USER_CREATED");
    expect(csv.buffer.toString("utf8")).toContain("audit@example.com");
    expect(csv.truncated).toBe(false);
  });

  it("neutralizes spreadsheet formula cells in CSV export", async () => {
    prismaMock.auditEntry.count.mockResolvedValue(1);
    prismaMock.auditEntry.findMany.mockResolvedValue([
      {
        id: "audit-2",
        action: AuditAction.USER_CREATED,
        entityType: "user",
        entityId: "=cmd|' /C calc'!A0",
        details: '{"note":"ok"}',
        createdAt: new Date("2026-03-21T00:00:00Z"),
        actor: {
          id: "user-2",
          name: "+admin",
          email: "audit@example.com",
          role: Role.PLATFORM_ADMIN,
        },
        scope: {
          id: "scope-1",
          name: "@scope",
          code: "KE",
        },
      },
    ] as never);

    const csv = await exportToCSV();
    const body = csv.buffer.toString("utf8");
    expect(body).toContain("\"'=cmd|' /C calc'!A0\"");
    expect(body).toContain('"\'+admin"');
    expect(body).toContain('"\'@scope"');
  });

  it("exports a PDF buffer", async () => {
    prismaMock.auditEntry.count.mockResolvedValue(0);
    prismaMock.auditEntry.findMany.mockResolvedValue([] as never);

    const pdf = await exportToPDF();

    expect(pdf.buffer.toString("utf8")).toContain("%PDF-1.4");
    expect(pdf.truncated).toBe(false);
  });

  it("returns paginated audit data from the API route", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.auditEntry.count.mockResolvedValue(0);
    prismaMock.auditEntry.findMany.mockResolvedValue([] as never);

    const response = await GET(
      new Request("http://localhost/api/audit?page=2&limit=10"),
    );
    if (!response) {
      throw new Error("Expected response");
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 0,
      page: 2,
      limit: AUDIT_BOUNDS_FIXTURE.expectedApiLimit,
    });
  });

  it("keeps baseline pagination fixture expectations explicit", () => {
    expect(AUDIT_BOUNDS_FIXTURE).toMatchObject({
      defaultPage: 1,
      defaultLimit: 25,
      expectedApiLimit: 10,
    });
  });

  it("returns truncation headers for bounded export", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.auditEntry.count.mockResolvedValue(1500);
    prismaMock.auditEntry.findMany.mockResolvedValue([] as never);

    const response = await exportGET(
      new Request("http://localhost/api/audit/export?format=csv"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Audit-Export-Truncated")).toBe("1");
  });
});
