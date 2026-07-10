import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { validateInputSet, updateGroupRasterMode } from "@/services/raster";
import { InputSetStatus } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

const model = {
  clubs: [],
  teams: [{ id: "t1" }],
  groups: [
    {
      ref: { league: "L", name: "G6" },
      size: 6,
      teamIds: ["t1"],
    },
  ],
  wishes: [],
  absoluteConstraints: [],
  warnings: [],
};

describe("raster input set service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks unconfirmed six-team groups", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify(model),
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);

    await expect(validateInputSet("input-1")).resolves.toMatchObject({
      errors: [expect.stringContaining("Six-team group")],
    });
  });

  it("accepts reviewed six-team group modes", async () => {
    for (const rasterMode of ["single", "double"] as const) {
      prismaMock.rasterInputSet.findUnique.mockResolvedValueOnce({
        id: `input-${rasterMode}`,
        status: InputSetStatus.DRAFT,
        seasonModelJson: JSON.stringify({
          ...model,
          groups: [{ ...model.groups[0], rasterMode }],
        }),
        _count: { wishes: 1, fixedRasterzahlen: 0 },
      } as never);
      prismaMock.rasterInputSet.update.mockResolvedValueOnce({} as never);

      await expect(
        validateInputSet(`input-${rasterMode}`),
      ).resolves.toMatchObject({
        errors: [],
      });
    }
  });

  it("persists reviewed six-team group mode", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "input-1",
      status: InputSetStatus.DRAFT,
      seasonModelJson: JSON.stringify(model),
      _count: { wishes: 1, fixedRasterzahlen: 0 },
    } as never);
    prismaMock.rasterInputSet.update.mockResolvedValue({
      id: "input-1",
    } as never);

    await updateGroupRasterMode("input-1", "L::G6", "double");

    expect(prismaMock.rasterInputSet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          seasonModelJson: expect.stringContaining('"rasterMode":"double"'),
        }),
      }),
    );
  });
});
