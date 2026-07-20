import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "../../src/raster/ingest/pdf-text.js";
import {
  parseGroupsPdf,
  parseUpperLeagueRasterPdf,
} from "../../src/raster/ingest/groups-pdf.js";
import type { Team } from "../../src/raster/types.js";

const fixture = path.join(
  __dirname,
  "../fixtures/raster/gruppen-und-raster-2026.pdf",
);

/**
 * The WTTV Rasterzahlen the association's planner decides and publishes at
 * https://nrw-tischtennis.de/wp-content/uploads/2026/06/Gruppen-und-Raster-2026.pdf
 *
 * `data/upper-fixed.csv` is the same information transcribed by hand for the
 * CLI, so it is an independent oracle: whatever reads this PDF has to agree
 * with it. These are the OWL clubs' teams that play at WTTV level -- the ones
 * whose fixed numbers occupy an OWL club's hall during a Bezirk run.
 */
const publishedRasterzahlen = [
  { league: "Verbandsliga 1 Erwachsene", team: "TuRa Elsen", rasterzahl: 5 },
  { league: "Landesliga 1 Erwachsene", team: "TuRa Elsen II", rasterzahl: 11 },
  { league: "Landesliga 1 Erwachsene", team: "TuRa Elsen III", rasterzahl: 5 },
  { league: "Landesliga 1 Erwachsene", team: "DJK Adler Brakel", rasterzahl: 4 },
  { league: "Verbandsliga 1 Damen", team: "SV Menne", rasterzahl: 4 },
  { league: "Verbandsliga 1 Damen", team: "TTV Lage", rasterzahl: 9 },
  { league: "Verbandsliga 1 Jugend", team: "TTV Salzkotten", rasterzahl: 1 },
  {
    league: "Verbandsliga 1 Jugend",
    team: "SV Teutonia Ossendorf",
    rasterzahl: 3,
  },
  { league: "Verbandsliga 1 Jugend", team: "DJK Adler Brakel", rasterzahl: 4 },
  { league: "NRW-Liga Mädchen", team: "SV Menne", rasterzahl: 7 },
];

describe("published Gruppen-und-Raster PDF", () => {
  // Proves the fixture carries the data and that the layout is regular enough
  // to parse: league heading, then "<Rasterzahl>  <team>  <day>. <time> Uhr".
  it("states each team's Rasterzahl next to its name under its league", async () => {
    const text = await extractPdfText(fixture);

    for (const { league, team, rasterzahl } of publishedRasterzahlen) {
      const leagueAt = text.indexOf(league);
      expect(leagueAt, `league ${league} missing`).toBeGreaterThan(-1);

      // The team is listed under its league, preceded by its Rasterzahl.
      const section = text.slice(leagueAt, leagueAt + 1400);
      const entry = new RegExp(
        `\\s${rasterzahl}\\s+${team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\wÄÖÜäöüß])`,
      );
      expect(entry.test(section), `${league}: ${rasterzahl} ${team}`).toBe(true);
    }
  }, 15_000);

  it("marks vacant raster slots rather than omitting them", async () => {
    const text = await extractPdfText(fixture);

    // A slot with no team reads "xxx", so the numbering stays continuous and a
    // parser must not treat the gap as the next team.
    expect(text).toContain("xxx");
  });
});

/**
 * The contract feature 010 has to satisfy. Skipped because the current parser
 * cannot meet it -- measured against the fixture, it scores 0/10:
 *
 *   TuRa Elsen        want=5  got=27
 *   SV Menne          want=4  got=27
 *
 * It matches on `team.label` ("Erwachsene", "Damen"), which occurs in every
 * league heading, then takes the nearest 1-2 digit number -- which is the year
 * in the title, "Spielzeit 2026/27". It also never reads the groups from the
 * document: it derives group sizes from `teams.length` and fills them by array
 * order. Its own warning concedes it is "best-effort".
 *
 * Unskip once a real parser exists. It needs to key on club name within a
 * league section rather than on age-class labels, and to read the leading
 * number of each entry as the Rasterzahl.
 */
describe("parseGroupsPdf reads the published Rasterzahlen", () => {
  it("agrees with the hand-made upper-fixed.csv", async () => {
    const teams: Team[] = publishedRasterzahlen.map((row, index) => ({
      id: `team-${index}`,
      clubId: row.team,
      label: row.team,
      homeWeekday: "friday",
      hall: "1",
      rasterzahl: { kind: "assignable" },
      confidence: "ok",
    }));

    const result = await parseGroupsPdf(fixture, teams);

    expect(
      publishedRasterzahlen.map((row, index) => ({
        team: row.team,
        rasterzahl: result.fixed.get(`team-${index}`),
      })),
    ).toEqual(
      publishedRasterzahlen.map((row) => ({
        team: row.team,
        rasterzahl: row.rasterzahl,
      })),
    );
  });
});

describe("parseUpperLeagueRasterPdf", () => {
  it("returns league entries with home day, time, vacancies skipped, and stable numbers", async () => {
    const result = await parseUpperLeagueRasterPdf(fixture);
    const rows = result.leagues.flatMap((league) =>
      league.entries.map((entry) => ({ league: league.league, ...entry })),
    );

    expect(rows).toEqual(
      expect.arrayContaining(
        publishedRasterzahlen.map((row) => expect.objectContaining(row)),
      ),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        league: "Verbandsliga 1 Erwachsene",
        team: "Jugend 70 Merfeld",
        rasterzahl: 1,
        homeWeekday: "saturday",
        startTime: "17.30",
      }),
    );
    expect(
      result.leagues
        .find((league) => league.league === "Verbandsliga 1 Erwachsene")
        ?.entries.some((entry) => entry.rasterzahl === 4),
    ).toBe(false);
  }, 15_000);
});
