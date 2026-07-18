import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "../../generated/prisma/enums";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { findMany: vi.fn() },
    scope: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/components/auth/UserLookupPanel", () => ({
  UserLookupPanel: () => null,
}));

import UsersPage from "@/app/(dashboard)/users/page";

describe("scope access review", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a scope admin access review only for held scopes", async () => {
    requireSession.mockResolvedValue({
      id: "actor",
      role: Role.SCOPE_ADMIN,
      status: UserStatus.ACTIVE,
    });
    prisma.scope.findMany
      .mockResolvedValueOnce([scope("OWL")])
      .mockResolvedValueOnce([
        {
          ...scope("OWL"),
          userAssignments: [
            {
              user: {
                id: "u1",
                name: "User 1",
                email: "u1@example.com",
                role: Role.SCOPE_USER,
              },
            },
          ],
        },
      ]);

    const result = await UsersPage();
    const text = collectText(result).join(" ");

    expect(text).toContain("OWL");
    expect(text).toContain("User 1");
    expect(text).not.toContain("KOELN");
  });
});

function scope(code: string) {
  return {
    id: `scope-${code}`,
    code,
    name: code,
    parent: {
      code: "WTTV",
      name: "WTTV",
      parent: { code: "DE", name: "Germany" },
    },
  };
}

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean")
    return [];
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child) => collectText(child));
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
