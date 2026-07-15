import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import { replaceParsedWishes } from "@/services/raster";
import { RasterConfidence } from "../../generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("raster wishes service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates parsed wish team rows before storing them", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue(null);

    await replaceParsedWishes("input-1", {
      clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
      teams: [
        {
          id: "club-a-1",
          clubId: "club-a",
          label: "Erwachsene II",
          homeWeekday: "monday",
          hall: "1",
          startTime: "19:45",
          spielwochePref: "A",
          rasterzahl: { kind: "assignable" },
          confidence: "review",
        },
        {
          id: "club-a-1-duplicate",
          clubId: "club-a",
          label: "Erwachsene II",
          homeWeekday: "monday",
          hall: "1",
          startTime: "19:45",
          spielwochePref: "A",
          rasterzahl: { kind: "assignable" },
          confidence: "review",
        },
      ],
      warnings: [],
    });

    expect(prismaMock.rasterWish.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ teamLabel: "Erwachsene II" })],
    });
  });

  it("resolves exact parsed club names to roster club numbers", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
    } as never);
    prismaMock.rasterTeamRoster.findFirst.mockResolvedValue({
      teams: [{ vereinName: "SC GW Paderborn", vereinNr: "42706" }],
    } as never);

    await replaceParsedWishes("input-1", {
      clubs: [
        {
          id: "sc-gw-paderborn",
          name: "SC GW Paderborn",
          venues: [],
          notes: "",
        },
      ],
      teams: [
        {
          id: "team-1",
          clubId: "sc-gw-paderborn",
          label: "Erwachsene",
          homeWeekday: "friday",
          hall: "1",
          rasterzahl: { kind: "assignable" },
          confidence: "ok",
        },
      ],
      warnings: [],
    });

    expect(prismaMock.rasterWish.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ clubId: "42706" })],
    });
  });

  it("keeps unrostered scopes on the old parsed identity", async () => {
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
    } as never);
    prismaMock.rasterTeamRoster.findFirst.mockResolvedValue(null);

    await replaceParsedWishes("input-1", {
      clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
      teams: [
        {
          id: "team-1",
          clubId: "club-a",
          label: "Erwachsene",
          homeWeekday: "friday",
          hall: "1",
          rasterzahl: { kind: "assignable" },
          confidence: "ok",
        },
      ],
      warnings: [],
    });

    expect(prismaMock.rasterWish.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          clubId: "club-a",
          confidence: RasterConfidence.OK,
        }),
      ],
    });
  });
});
