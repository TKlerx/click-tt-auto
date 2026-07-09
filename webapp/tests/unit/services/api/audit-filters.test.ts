import { describe, expect, it } from "vitest";
import { AuditAction } from "../../../../generated/prisma/enums";
import {
  buildAuditFilters,
  parseAuditExportRequest,
  parseAuditListRequest,
} from "@/services/api/audit-filters";

describe("audit filter service", () => {
  it("parses list filters with pagination", async () => {
    const result = parseAuditListRequest(
      new Request(
        "http://localhost/api/audit?action=USER_CREATED&entityType=User&page=2&limit=10",
      ),
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.filters).toMatchObject({
        action: AuditAction.USER_CREATED,
        entityType: "User",
        page: 2,
        limit: 10,
      });
    }
  });

  it("rejects invalid pagination values", async () => {
    const badPage = parseAuditListRequest(
      new Request("http://localhost/api/audit?page=0&limit=10"),
    );
    const badLimit = parseAuditListRequest(
      new Request("http://localhost/api/audit?page=1&limit=0"),
    );

    expect("error" in badPage).toBe(true);
    expect("error" in badLimit).toBe(true);
  });

  it("caps oversized pagination limits", async () => {
    const result = parseAuditListRequest(
      new Request("http://localhost/api/audit?page=1&limit=9999"),
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.limit).toBe(100);
    }
  });

  it("rejects invalid audit actions", async () => {
    const result = parseAuditListRequest(
      new Request("http://localhost/api/audit?action=NOT_REAL"),
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it("parses export filters without pagination", async () => {
    const result = parseAuditExportRequest(
      new Request(
        "http://localhost/api/audit/export?format=csv&actorId=user-1",
      ),
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.format).toBe("csv");
      expect(result.filters).toMatchObject({
        actorId: "user-1",
      });
    }
  });

  it("builds a prisma-compatible where clause", async () => {
    const where = buildAuditFilters({
      action: AuditAction.USER_CREATED,
      actorId: "user-1",
    });

    expect(where).toEqual({
      action: AuditAction.USER_CREATED,
      actorId: "user-1",
    });
  });
});
