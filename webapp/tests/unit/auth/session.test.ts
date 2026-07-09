import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Role,
  ThemePreference,
  UserStatus,
} from "../../../generated/prisma/enums";

const { getSessionUser } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser,
}));

import { GET } from "@/app/api/auth/session/route";

describe("session endpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    getSessionUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated",
    });
  });

  it("returns the authenticated user payload", async () => {
    getSessionUser.mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      name: "Jane Doe",
      role: Role.SCOPE_USER,
      status: UserStatus.ACTIVE,
      themePreference: ThemePreference.DARK,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user_1",
        email: "user@example.com",
        name: "Jane Doe",
        role: Role.SCOPE_USER,
        status: UserStatus.ACTIVE,
        themePreference: ThemePreference.DARK,
      },
    });
  });
});
