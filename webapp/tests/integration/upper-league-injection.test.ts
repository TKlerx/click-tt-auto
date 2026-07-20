import { afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/lib/__mocks__/db";
import {
  applyUpperLeagueInjectionToInputSet,
  buildUpperLeagueInjection,
  mergeInjection,
} from "@/services/raster/upperLeague";

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

const parsedImport = {
  sourceLabel: "gruppen.pdf",
  leagues: [
    {
      league: "Verbandsliga 1 Erwachsene",
      size: 11,
      entries: [
        {
          rasterzahl: 5,
          team: "TuRa Elsen",
          homeWeekday: "saturday",
          startTime: "17.30",
        },
        { rasterzahl: 4, team: "Ghost Club" },
      ],
    },
  ],
};

const model = {
  clubs: [{ id: "tura-elsen", name: "TuRa Elsen", venues: [{ hall: "1" }] }],
  teams: [
    {
      id: "bezirksliga-tura-elsen-ii",
      clubId: "tura-elsen",
      label: "Erwachsene II",
      homeWeekday: "saturday",
      hall: "1",
    },
  ],
  groups: [
    {
      ref: { league: "Bezirksliga", name: "Bezirksliga 1" },
      size: 10,
      teamIds: ["bezirksliga-tura-elsen-ii"],
    },
  ],
};

describe("upper-league injection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("injects exact matches, omits non-exact PDF rows, and records gaps", async () => {
    prismaMock.rasterSource.findFirst.mockResolvedValue({
      parsedJson: JSON.stringify(parsedImport),
    } as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wish-upper",
        clubId: "tura-elsen",
        clubName: "TuRa Elsen",
        teamLabel: "Erwachsene",
        homeWeekday: "SATURDAY",
        hall: "1",
        startTime: "17.30",
      },
      {
        id: "wish-missing",
        clubId: "tura-elsen",
        clubName: "TuRa Elsen",
        teamLabel: "Damen",
        homeWeekday: "SUNDAY",
        hall: "1",
      },
    ] as never);

    const result = await buildUpperLeagueInjection({
      inputSetId: "input-1",
      scopeId: "scope-owl",
      season: "2026/27",
      model,
    });

    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({
      clubId: "tura-elsen",
      label: "Erwachsene",
      hall: "1",
      homeWeekday: "saturday",
      planned: false,
      capacityRelevant: true,
      rasterzahl: { kind: "fixed", value: 5 },
    });
    expect(result.coverage).toMatchObject({
      importPresent: true,
      matched: [{ clubId: "tura-elsen", label: "Erwachsene", rasterzahl: 5 }],
      unmatched: [{ clubId: "tura-elsen", label: "Damen" }],
      excludedNoHall: [],
      invalidRasterzahl: [],
    });
  });

  it("records absent imports and no-hall matches without injecting", async () => {
    prismaMock.rasterSource.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      buildUpperLeagueInjection({
        inputSetId: "input-1",
        scopeId: "scope-owl",
        season: "2026/27",
        model,
      }),
    ).resolves.toMatchObject({
      teams: [],
      coverage: { importPresent: false },
    });

    prismaMock.rasterSource.findFirst.mockResolvedValue({
      parsedJson: JSON.stringify(parsedImport),
    } as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wish-upper",
        clubId: "tura-elsen",
        clubName: "TuRa Elsen",
        teamLabel: "Erwachsene",
        homeWeekday: "SATURDAY",
        hall: null,
      },
    ] as never);

    const result = await buildUpperLeagueInjection({
      inputSetId: "input-1",
      scopeId: "scope-owl",
      season: "2026/27",
      model,
    });

    expect(result.teams).toEqual([]);
    expect(result.coverage.excludedNoHall).toEqual([
      { clubId: "tura-elsen", label: "Erwachsene" },
    ]);
  });

  it("skips impossible fixed Rasterzahlen before they reach the solver", async () => {
    prismaMock.rasterSource.findFirst.mockResolvedValue({
      parsedJson: JSON.stringify({
        sourceLabel: "gruppen.pdf",
        leagues: [
          {
            league: "Verbandsliga 1 Erwachsene",
            size: 4,
            entries: [{ rasterzahl: 4, team: "TuRa Elsen" }],
          },
        ],
      }),
    } as never);
    prismaMock.rasterWish.findMany.mockResolvedValue([
      {
        id: "wish-upper",
        clubId: "tura-elsen",
        clubName: "TuRa Elsen",
        teamLabel: "Erwachsene",
        homeWeekday: "SATURDAY",
        hall: "1",
      },
    ] as never);

    const result = await buildUpperLeagueInjection({
      inputSetId: "input-1",
      scopeId: "scope-owl",
      season: "2026/27",
      model,
    });

    expect(result.teams).toEqual([]);
    expect(result.coverage.invalidRasterzahl).toEqual([
      {
        clubId: "tura-elsen",
        label: "Erwachsene",
        rasterzahl: 4,
        size: 4,
      },
    ]);
  });

  it("merges injected teams as input-only and replaces prior injections", async () => {
    const merged = mergeInjection(
      {
        ...model,
        teams: [
          ...model.teams,
          { id: "upper-old", clubId: "old", label: "Erwachsene" },
        ],
      },
      {
        teams: [
          {
            id: "upper-new",
            clubId: "tura-elsen",
            label: "Erwachsene",
            planned: false,
          } as never,
        ],
        groups: [
          {
            ref: { league: "Verbandsliga 1 Erwachsene", name: "Verbandsliga 1 Erwachsene" },
            size: 11,
            teamIds: ["upper-new"],
          },
        ],
        coverage: {
          importPresent: true,
          matched: [],
          unmatched: [],
          excludedNoHall: [],
          invalidRasterzahl: [],
        },
      },
    );

    expect(merged.teams?.map((team) => team.id)).toEqual([
      "bezirksliga-tura-elsen-ii",
      "upper-new",
    ]);
    expect(merged.upperLeague?.importPresent).toBe(true);
  });

  it("does not inject into combined input sets", async () => {
    prismaMock.rasterInputSet.findUnique.mockResolvedValue({
      id: "combined-1",
      scopeId: "scope-owl",
      season: "2026/27",
      seasonModelJson: JSON.stringify(model),
      spannedScopes: [{ scopeId: "scope-a" }, { scopeId: "scope-b" }],
    } as never);

    await applyUpperLeagueInjectionToInputSet("combined-1");

    expect(prismaMock.rasterInputSet.update).not.toHaveBeenCalled();
  });
});
