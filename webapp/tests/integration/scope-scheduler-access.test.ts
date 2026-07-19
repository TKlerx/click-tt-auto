import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { assertRasterAccess } from "@/lib/raster/access";
import { Role } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

describe("scope scheduler access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows a scope admin to schedule in a held scope", async () => {
    prismaMock.scope.findFirst.mockResolvedValue({ id: "scope-OWL" } as never);

    await expect(
      assertRasterAccess(
        { id: "actor", role: Role.SCOPE_ADMIN },
        "OWL",
        "scheduler",
      ),
    ).resolves.toBe(true);
  });

  it("refuses a scope admin outside held scopes", async () => {
    prismaMock.scope.findFirst.mockResolvedValue(null);

    const result = await assertRasterAccess(
      { id: "actor", role: Role.SCOPE_ADMIN },
      "KOELN",
      "scheduler",
    );

    expect(result).not.toBe(true);
  });

  it("keeps scope users at viewer", async () => {
    const result = await assertRasterAccess(
      { id: "viewer", role: Role.SCOPE_USER },
      "OWL",
      "scheduler",
    );

    expect(result).not.toBe(true);
    expect(prismaMock.scope.findFirst).not.toHaveBeenCalled();
  });

  it("leaves platform admins unaffected", async () => {
    await expect(
      assertRasterAccess(
        { id: "admin", role: Role.PLATFORM_ADMIN },
        "KOELN",
        "scheduler",
      ),
    ).resolves.toBe(true);
  });
});
