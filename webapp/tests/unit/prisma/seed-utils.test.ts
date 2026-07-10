import { describe, expect, it } from "vitest";
import { normalizeInitialAdminEmail } from "../../../prisma/seed-utils";

describe("normalizeInitialAdminEmail", () => {
  it("normalizes mixed-case and surrounding whitespace", () => {
    expect(normalizeInitialAdminEmail("  Admin.User@Example.COM ")).toBe(
      "admin.user@example.com",
    );
  });
});
