import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/better-auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import {
  hashPassword,
  validatePasswordComplexity,
  verifyPassword,
} from "@/lib/auth";

describe("password helpers", () => {
  it("accepts passwords that meet complexity requirements", () => {
    expect(validatePasswordComplexity("TempPass123")).toBe(true);
  });

  it("rejects passwords that are too weak", () => {
    expect(validatePasswordComplexity("short")).toBe(false);
  });

  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("TempPass123");
    await expect(verifyPassword("TempPass123", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPass123", hash)).resolves.toBe(false);
  }, 15_000);
});
