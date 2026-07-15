import { describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  rasterTeamRoster: { findFirst: vi.fn() },
  rasterWish: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma }));

import { getRasterRosterCoverage } from "@/services/raster/roster";

describe("roster coverage integration", () => {
  it("lists unmentioned roster teams and unexpected parsed teams", async () => {
    prisma.rasterTeamRoster.findFirst.mockResolvedValue({
      id: "roster-1",
      teams: [
        {
          vereinName: "SC GW Paderborn",
          altersklasse: "Erwachsene",
          mannschaftNr: "1",
        },
        {
          vereinName: "TTV Daseburg",
          altersklasse: "Erwachsene",
          mannschaftNr: "1",
        },
      ],
    });
    prisma.rasterWish.findMany.mockResolvedValue([
      { clubId: "42706", clubName: "SC GW Paderborn", teamLabel: "Erwachsene" },
      { clubId: "x", clubName: "Ghost", teamLabel: "Erwachsene" },
    ]);

    const coverage = await getRasterRosterCoverage("owl", "2026/27");

    expect(coverage.unmentionedRosterTeams).toHaveLength(1);
    expect(coverage.unexpectedParsedTeams).toEqual([
      { clubId: "x", clubName: "Ghost", teamLabel: "Erwachsene" },
    ]);
  });
});
