import { prisma } from "@/lib/db";
import { normalizeRasterSeason } from "@/lib/raster/season";
import type { RosterCsvParseResult } from "../../../../src/raster/ingest/roster-csv.js";

export type RosterImportSummary = {
  rosterId: string;
  teams: number;
  clubs: number;
  groups: number;
  charset: RosterCsvParseResult["charset"];
};

export async function importRasterRoster(params: {
  scopeId: string;
  scopeCode: string;
  scopeName: string;
  season: string;
  importedById: string;
  parsed: RosterCsvParseResult;
}): Promise<RosterImportSummary> {
  const sourceRegion = onlyValue(params.parsed.rows.map((row) => row.region));
  const sourceSeason = onlyValue(params.parsed.rows.map((row) => row.season));
  const season = normalizeRasterSeason(params.season);
  // The roster mirrors one export, so the summary counts what is stored.
  const rows = dedupeByTeamKey(params.parsed.rows);

  if (sourceSeason !== season) {
    throw new Error(
      `Roster season mismatch: expected ${season}, got ${sourceSeason}.`,
    );
  }
  if (!regionMatches(sourceRegion, params.scopeCode, params.scopeName)) {
    throw new Error(
      `Roster region mismatch: expected ${params.scopeName}, got ${sourceRegion}.`,
    );
  }

  const roster = await prisma.$transaction(async (tx) => {
    const existing = await tx.rasterTeamRoster.findFirst({
      where: { scopeId: params.scopeId, season },
      orderBy: { importedAt: "desc" },
      select: { id: true },
    });
    const roster = existing
      ? await tx.rasterTeamRoster.update({
          where: { id: existing.id },
          data: {
            sourceRegion,
            sourceSeason,
            charset: prismaCharset(params.parsed.charset),
            importedById: params.importedById,
            importedAt: new Date(),
          },
        })
      : await tx.rasterTeamRoster.create({
          data: {
            scopeId: params.scopeId,
            season,
            sourceRegion,
            sourceSeason,
            charset: prismaCharset(params.parsed.charset),
            importedById: params.importedById,
          },
        });

    const storedTeams = await tx.rasterRosterTeam.findMany({
      where: { rosterId: roster.id },
      select: {
        id: true,
        vereinNr: true,
        vereinName: true,
        altersklasse: true,
        mannschaftNr: true,
        liga: true,
        gruppe: true,
      },
    });
    const storedByKey = new Map(
      storedTeams.map((team) => [teamKey(team), team]),
    );

    const importedKeys = new Set(rows.map(teamKey));
    const withdrawn = storedTeams.filter(
      (team) => !importedKeys.has(teamKey(team)),
    );
    if (withdrawn.length) {
      await tx.rasterRosterTeam.deleteMany({
        where: { id: { in: withdrawn.map((team) => team.id) } },
      });
    }

    const created: typeof rows = [];
    for (const row of rows) {
      const match = storedByKey.get(teamKey(row));
      if (!match) {
        created.push(row);
        continue;
      }
      if (
        match.vereinName === row.vereinName &&
        match.liga === row.liga &&
        match.gruppe === row.gruppe
      ) {
        continue;
      }
      await tx.rasterRosterTeam.update({
        where: { id: match.id },
        data: {
          vereinName: row.vereinName,
          liga: row.liga,
          gruppe: row.gruppe,
        },
      });
    }

    if (created.length) {
      await tx.rasterRosterTeam.createMany({
        data: created.map((row) => ({
          rosterId: roster.id,
          vereinNr: row.vereinNr,
          vereinName: row.vereinName,
          altersklasse: row.altersklasse,
          mannschaftNr: row.mannschaftNr,
          liga: row.liga,
          gruppe: row.gruppe,
        })),
      });
    }

    return roster;
  });

  return {
    rosterId: roster.id,
    teams: rows.length,
    clubs: new Set(rows.map((row) => row.vereinNr)).size,
    groups: new Set(rows.map((row) => row.gruppe)).size,
    charset: params.parsed.charset,
  };
}

export async function getRasterRoster(scopeId: string, season: string) {
  return prisma.rasterTeamRoster.findFirst({
    where: { scopeId, season: normalizeRasterSeason(season) },
    orderBy: { importedAt: "desc" },
    include: { teams: { orderBy: [{ gruppe: "asc" }, { vereinName: "asc" }] } },
  });
}

export async function getRasterRosterCoverage(scopeId: string, season: string) {
  const roster = await getRasterRoster(scopeId, season);
  if (!roster) {
    return {
      roster: null,
      unmentionedRosterTeams: [],
      unexpectedParsedTeams: [],
    };
  }

  const wishes = await prisma.rasterWish.findMany({
    where: { inputSet: { scopeId, season: normalizeRasterSeason(season) } },
    select: { clubId: true, clubName: true, teamLabel: true },
  });
  const wishKeys = new Set(
    wishes.map((wish) => [wish.clubName, wish.teamLabel ?? ""].join("\0")),
  );
  const rosterKeys = new Set(
    roster.teams.map((team) =>
      [
        team.vereinName,
        rosterTeamLabel(team.altersklasse, team.mannschaftNr),
      ].join("\0"),
    ),
  );

  return {
    roster,
    unmentionedRosterTeams: roster.teams.filter(
      (team) =>
        !wishKeys.has(
          [
            team.vereinName,
            rosterTeamLabel(team.altersklasse, team.mannschaftNr),
          ].join("\0"),
        ),
    ),
    unexpectedParsedTeams: wishes.filter(
      (wish) =>
        !rosterKeys.has([wish.clubName, wish.teamLabel ?? ""].join("\0")),
    ),
  };
}

function teamKey(team: {
  vereinNr: string;
  altersklasse: string;
  mannschaftNr: string;
}) {
  return [team.vereinNr, team.altersklasse, team.mannschaftNr].join("\0");
}

// The upsert loop this replaced let a later duplicate row win; keep that.
function dedupeByTeamKey(rows: RosterCsvParseResult["rows"]) {
  return [...new Map(rows.map((row) => [teamKey(row), row])).values()];
}

function onlyValue(values: string[]) {
  const unique = new Set(values);
  if (unique.size !== 1) {
    throw new Error(
      `Roster export must contain exactly one value, got ${unique.size}.`,
    );
  }
  const [value] = unique;
  if (!value) throw new Error("Roster export contains no rows.");
  return value;
}

function regionMatches(region: string, scopeCode: string, scopeName: string) {
  const normalized = normalize(region);
  return (
    normalized === normalize(scopeCode) || normalized === normalize(scopeName)
  );
}

function normalize(value: string) {
  return value.toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "");
}

function prismaCharset(charset: RosterCsvParseResult["charset"]) {
  return charset === "utf-8" ? "UTF8" : "ISO_8859_15";
}

function rosterTeamLabel(altersklasse: string, mannschaftNr: string) {
  return mannschaftNr === "1"
    ? altersklasse
    : `${altersklasse} ${toRoman(Number(mannschaftNr))}`;
}

function toRoman(value: number) {
  const numerals = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const;
  let rest = value;
  let result = "";
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      result += numeral;
      rest -= amount;
    }
  }
  return result || String(value);
}
