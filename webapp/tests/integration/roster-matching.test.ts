import { describe, expect, it, vi, beforeEach } from "vitest";
import { RasterConfidence } from "../../generated/prisma/enums";

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn((callback) => callback(prisma)),
  rasterInputSet: { update: vi.fn(), findUnique: vi.fn() },
  rasterTeamRoster: { findFirst: vi.fn() },
  rasterWish: { deleteMany: vi.fn(), createMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma }));

import { replaceParsedWishes } from "@/services/raster/wishes";

describe("roster matching integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rasterInputSet.findUnique.mockResolvedValue({
      scopeId: "owl",
      season: "2026/27",
    });
  });

  it("resolves exact names, reviews non-matches, and leaves unrostered scopes alone", async () => {
    prisma.rasterTeamRoster.findFirst.mockResolvedValueOnce({
      teams: [{ vereinName: "SC GW Paderborn", vereinNr: "42706" }],
    });
    await replaceParsedWishes("input-1", {
      clubs: [
        {
          id: "sc-gw-paderborn",
          name: "SC GW Paderborn",
          venues: [],
          notes: "",
        },
        { id: "ghost", name: "Ghost", venues: [], notes: "" },
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
        {
          id: "team-2",
          clubId: "ghost",
          label: "Erwachsene",
          homeWeekday: "friday",
          hall: "1",
          rasterzahl: { kind: "assignable" },
          confidence: "ok",
        },
      ],
      warnings: [],
    });

    expect(prisma.rasterWish.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ clubId: "42706" }),
        expect.objectContaining({
          clubId: "ghost",
          confidence: RasterConfidence.REVIEW,
        }),
      ]),
    });

    prisma.rasterWish.createMany.mockClear();
    prisma.rasterTeamRoster.findFirst.mockResolvedValueOnce(null);
    await replaceParsedWishes("input-1", {
      clubs: [{ id: "club-a", name: "Club A", venues: [], notes: "" }],
      teams: [
        {
          id: "team-3",
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

    expect(prisma.rasterWish.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ clubId: "club-a" })],
    });
  });
});
