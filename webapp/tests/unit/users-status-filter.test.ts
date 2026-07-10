import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireApiUserWithRoles } = vi.hoisted(() => ({
  requireApiUserWithRoles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUserWithRoles,
}));

import { GET } from "@/app/api/users/route";

describe("users status filter", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts valid status filters", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findMany.mockResolvedValue([] as never);

    const response = await GET(
      new Request("http://localhost/api/users?status=ACTIVE"),
    );

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { status: UserStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(200);
  });

  it("rejects invalid status filters", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });

    const response = await GET(
      new Request("http://localhost/api/users?status=BROKEN"),
    );

    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Invalid status filter. Supported values: PENDING_APPROVAL, ACTIVE, INACTIVE",
    });
  });

  it("returns all users when the filter is absent", async () => {
    requireApiUserWithRoles.mockResolvedValue({
      user: { id: "admin-1", role: Role.PLATFORM_ADMIN },
    });
    prismaMock.user.findMany.mockResolvedValue([] as never);

    const response = await GET(new Request("http://localhost/api/users"));

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: "desc" },
    });
    if (!response) {
      throw new Error("Expected response");
    }
    expect(response.status).toBe(200);
  });
});
