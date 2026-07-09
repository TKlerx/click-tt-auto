import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { __resetRateLimitStore } from "@/lib/rate-limit";
import { AuthMethod, Role, UserStatus } from "../../../generated/prisma/enums";

const { signInEmail } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
}));
const { verifyPassword } = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/better-auth", () => ({
  auth: {
    api: {
      signInEmail,
    },
  },
}));

vi.mock("@/lib/better-auth-http", () => ({
  applySetCookieHeaders: vi.fn((response: Response) => response),
}));

vi.mock("@/lib/auth", () => ({
  verifyPassword,
}));

import { POST } from "@/app/api/auth/login/route";

describe("login route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    __resetRateLimitStore();
  });

  it("rejects missing users before Better Auth sign-in", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.account.findUnique.mockResolvedValue(null);
    verifyPassword.mockResolvedValue(false);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "missing@example.com",
          password: "TempPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "missing@example.com" },
    });
    expect(verifyPassword).toHaveBeenCalled();
    expect(signInEmail).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it("delegates password verification to Better Auth for active users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member User",
      role: Role.SCOPE_USER,
      authMethod: AuthMethod.LOCAL,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    } as never);
    prismaMock.account.findUnique.mockResolvedValue({
      password: "stored-hash",
    } as never);
    verifyPassword.mockResolvedValue(true);
    prismaMock.user.update.mockResolvedValue({} as never);
    signInEmail.mockResolvedValue(new Response(null, { status: 200 }));

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "Member@Example.com",
          password: "TempPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(signInEmail).toHaveBeenCalledWith({
      body: {
        email: "member@example.com",
        password: "TempPass123",
      },
      headers: expect.any(Headers),
      asResponse: true,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "user-1",
        email: "member@example.com",
      },
      redirectTo: "/dashboard",
    });
  });

  it("returns a generic auth failure for inactive accounts", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "inactive@example.com",
      name: "Inactive User",
      role: Role.SCOPE_USER,
      authMethod: AuthMethod.LOCAL,
      status: UserStatus.INACTIVE,
      mustChangePassword: false,
    } as never);
    prismaMock.account.findUnique.mockResolvedValue({
      password: "stored-hash",
    } as never);
    verifyPassword.mockResolvedValue(true);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "inactive@example.com",
          password: "TempPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(verifyPassword).toHaveBeenCalledWith("TempPass123", "stored-hash");
    expect(signInEmail).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Invalid email or password",
    });
  });

  it("does not reveal inactive status when the password is wrong", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-3",
      email: "inactive@example.com",
      name: "Inactive User",
      role: Role.SCOPE_USER,
      authMethod: AuthMethod.LOCAL,
      status: UserStatus.INACTIVE,
      mustChangePassword: false,
    } as never);
    prismaMock.account.findUnique.mockResolvedValue({
      password: "stored-hash",
    } as never);
    verifyPassword.mockResolvedValue(false);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "inactive@example.com",
          password: "WrongPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(signInEmail).not.toHaveBeenCalled();
    expect(prismaMock.auditEntry.create).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Invalid email or password",
    });
  });

  it("rate-limits unknown clients by email bucket instead of one global bucket", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.account.findUnique.mockResolvedValue(null);
    verifyPassword.mockResolvedValue(false);

    for (let index = 0; index < 6; index += 1) {
      await POST(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: "bucket-a@example.com",
            password: "TempPass123",
          }),
          headers: { "content-type": "application/json" },
        }),
      );
    }

    const blocked = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "bucket-a@example.com",
          password: "TempPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(blocked.status).toBe(429);

    const otherAccount = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "bucket-b@example.com",
          password: "TempPass123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(otherAccount.status).toBe(401);
  });
});
