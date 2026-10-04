import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { validateInputSet } from "@/services/raster";
import { InputSetStatus } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

describe("source identity validation", () => {
  afterEach(() => vi.clearAllMocks());

  it("blocks a run while an uncertain source identity alias awaits review", async () => {
    const model = {
      clubs: [],
      teams: [{ id: "t1" }],
      groups: [
        {
          ref: { league: "L", name: "G6" },
          size: 6,
          teamIds: ["t1"],
          rasterMode: "single",
        },
      ],
      wishes: [],
      absoluteConstraints: [],
      warnings: [],
    };
    prismaMock.rasterInputSet.findUnique
      .mockResolvedValueOnce({
        id: "input-1",
        scopeId: "owl",
        season: "2026/27",
      } as never)
      .mockResolvedValueOnce({
        id: "input-1",
        scopeId: "owl",
        season: "2026/27",
        status: InputSetStatus.DRAFT,
        seasonModelJson: JSON.stringify(model),
        _count: { wishes: 1, fixedRasterzahlen: 0 },
      } as never)
      .mockResolvedValueOnce({
        scopeId: "owl",
        season: "2026/27",
        seasonModelJson: JSON.stringify({
          sourceIdentityReferences: [
            { kind: "CLUB", normalizedSourceName: "scgwpaderborn" },
          ],
        }),
      } as never)
      .mockResolvedValueOnce({
        scopeId: "owl",
        season: "2026/27",
        scope: { code: "OWL" },
        seasonModelJson: JSON.stringify(model),
        wishes: [],
      } as never);
    prismaMock.rasterSourceIdentityAlias.findMany.mockResolvedValue([
      { kind: "CLUB", rawSourceName: "SC GW Paderborn" },
    ] as never);

    await expect(validateInputSet("input-1")).resolves.toMatchObject({
      errors: [expect.stringContaining("SC GW Paderborn")],
    });
  });
});
