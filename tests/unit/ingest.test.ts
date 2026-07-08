import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  assignmentFromRows,
  buildSeasonModelFromAssignments,
  extractRelationalWishes,
  parseWishesPdf,
  parseWishesText
} from "../../src/raster/ingest/index.js";
import type { Team } from "../../src/raster/types.js";

describe("wish free-text extraction", () => {
  it("extracts simple Wochenwechsel relations for review", () => {
    const teams: Team[] = [
      {
        id: "t1",
        clubId: "c",
        label: "Erwachsene",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      },
      {
        id: "t2",
        clubId: "c",
        label: "Erwachsene II",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      }
    ];
    expect(
      extractRelationalWishes(
        "c",
        "1. und 2. Mannschaft im Wochenwechsel",
        teams
      )
    ).toEqual([
      {
        clubId: "c",
        teamA: "t1",
        teamB: "t2",
        relation: "wechsel",
        source: "freetext",
        confidence: "review"
      }
    ]);
  });
});

describe("assignment table ingestion", () => {
  it("keeps fixed table rows fixed and maps current rows to internal ids", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      group: "G",
      rasterzahl: index + 1,
      team: `Club ${String.fromCharCode(65 + index)}`,
      sourceUrl: ""
    }));
    const model = await buildSeasonModelFromAssignments(rows, new Map(), [rows[0]!]);
    const fixedTeam = model.teams.find((team) => team.name === "Club A");

    expect(fixedTeam?.rasterzahl).toEqual({ kind: "fixed", value: 1 });
    expect(assignmentFromRows(model, rows)).toEqual({
      "g-1-club-a": 1,
      "g-2-club-b": 2,
      "g-3-club-c": 3,
      "g-4-club-d": 4,
      "g-5-club-e": 5,
      "g-6-club-f": 6,
      "g-7-club-g": 7,
      "g-8-club-h": 8,
      "g-9-club-i": 9,
      "g-10-club-j": 10,
      "g-11-club-k": 11,
      "g-12-club-l": 12
    });
  });

  it("matches fixed rows by league/group/team, group/team, or unique team", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      league: "L",
      group: "G",
      division: "Erwachsene",
      rasterzahl: index + 1,
      team: `Club ${String.fromCharCode(65 + index)}`,
      sourceUrl: ""
    }));
    const model = await buildSeasonModelFromAssignments(rows, new Map(), [
      { league: "L", group: "G", division: "Erwachsene", rasterzahl: 1, team: "Club A", sourceUrl: "" },
      { group: "G", rasterzahl: 2, team: "Club B", sourceUrl: "" },
      { group: "", rasterzahl: 3, team: "Club C", sourceUrl: "" }
    ]);

    expect(model.teams.find((team) => team.name === "Club A")?.rasterzahl.kind).toBe("fixed");
    expect(model.teams.find((team) => team.name === "Club B")?.rasterzahl.kind).toBe("fixed");
    expect(model.teams.find((team) => team.name === "Club C")?.rasterzahl.kind).toBe("fixed");
    expect(model.teams.find((team) => team.name === "Club D")?.rasterzahl.kind).toBe("assignable");
  });

  it("uses division to distinguish fixed rows", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      league: "L",
      group: "G",
      division: index === 0 ? "Damen" : "Erwachsene",
      rasterzahl: index + 1,
      team: index === 0 ? "Club A" : `Club ${String.fromCharCode(65 + index)}`,
      sourceUrl: ""
    }));
    const model = await buildSeasonModelFromAssignments(rows, new Map(), [
      { league: "L", group: "G", division: "Erwachsene", rasterzahl: 1, team: "Club A", sourceUrl: "" }
    ]);

    expect(model.teams.find((team) => team.name === "Club A")?.rasterzahl.kind).toBe("assignable");
  });
});

describe("wishes PDF text ingestion", () => {
  it("splits aggregate wish exports into clubs and team labels", () => {
    const parsed = parseWishesText(
      "Terminmeldung_gesamt_bol.pdf",
      [
        "Westdeutscher Tischtennis-Verband e.V. Bezirksoberliga Erwachsene Terminwünsche SV Rot-Weiß Alfen (42724) Kontaktperson",
        "Spiellokal 1 Sporthalle Alfen Terminwünsche Mannschaft Heimspiele Auswärtsspiele",
        "Erwachsene Fr 20:00, Halle 1 an den Wochentagen Mo - Do auswärts",
        "Erwachsene II Mi 20:00, Halle 1 Spielwoche A an den Wochentagen Mo - Do auswärts",
        "Jugend 19 So 10:00, Halle 1 Spielwoche B an den Wochentagen Mo - Do auswärts",
        "nu .Dokument",
        "Westdeutscher Tischtennis-Verband e.V. Bezirksoberliga Erwachsene Terminwünsche Tischtennisverein Höxter (42505) Kontaktperson",
        "Spiellokal 1 Sporthalle am Bielenberg Terminwünsche Mannschaft Heimspiele Auswärtsspiele",
        "Damen Di 19:30, Halle 1 an den Wochentagen Mo - Do auswärts",
        "nu .Dokument"
      ].join(" ")
    );

    expect(parsed.clubs.map((club) => club.name)).toEqual([
      "SV Rot-Weiß Alfen",
      "Tischtennisverein Höxter"
    ]);
    expect(parsed.teams.map((team) => [team.clubId, team.label, team.homeWeekday, team.spielwochePref])).toEqual([
      ["sv-rot-wei-alfen-42724", "Erwachsene", "friday", undefined],
      ["sv-rot-wei-alfen-42724", "Erwachsene II", "wednesday", "A"],
      ["sv-rot-wei-alfen-42724", "Jugend 19", "sunday", "B"],
      ["tischtennisverein-h-xter-42505", "Damen", "tuesday", undefined]
    ]);
  });

  it("extracts the BOL aggregate PDF fixture", async () => {
    const parsed = await parseWishesPdf(
      path.join("tests", "fixtures", "raster", "terminmeldung-gesamt-bol.pdf")
    );

    expect(parsed.clubs).toHaveLength(12);
    expect(parsed.teams).toHaveLength(94);
    expect(parsed.clubs.map((club) => club.name)).not.toContain("terminmeldung-gesamt-bol");
    expect(parsed.clubs.slice(0, 3).map((club) => club.name)).toEqual([
      "SV Rot-Weiß Alfen",
      "Tischtennisverein Höxter",
      "SC GW Paderborn"
    ]);
    expect(
      parsed.teams.slice(0, 8).map((team) => ({
        clubId: team.clubId,
        label: team.label,
        weekday: team.homeWeekday,
        weekSlot: team.spielwochePref,
        hall: team.hall,
        startTime: team.startTime
      }))
    ).toEqual([
      {
        clubId: "sv-rot-wei-alfen-42724",
        label: "Erwachsene",
        weekday: "friday",
        weekSlot: undefined,
        hall: "1",
        startTime: "20:00"
      },
      {
        clubId: "sv-rot-wei-alfen-42724",
        label: "Erwachsene II",
        weekday: "wednesday",
        weekSlot: undefined,
        hall: "1",
        startTime: "20:00"
      },
      {
        clubId: "sv-rot-wei-alfen-42724",
        label: "Erwachsene III",
        weekday: "monday",
        weekSlot: undefined,
        hall: "1",
        startTime: "20:00"
      },
      {
        clubId: "sv-rot-wei-alfen-42724",
        label: "Erwachsene IV",
        weekday: "wednesday",
        weekSlot: undefined,
        hall: "1",
        startTime: "20:00"
      },
      {
        clubId: "sv-rot-wei-alfen-42724",
        label: "Jugend 19",
        weekday: "sunday",
        weekSlot: undefined,
        hall: "1",
        startTime: "10:00"
      },
      {
        clubId: "sv-rot-wei-alfen-42724",
        label: "Jugend 15",
        weekday: "sunday",
        weekSlot: undefined,
        hall: "1",
        startTime: "10:00"
      },
      {
        clubId: "tischtennisverein-h-xter-42505",
        label: "Erwachsene",
        weekday: "saturday",
        weekSlot: "A",
        hall: "2",
        startTime: "18:30"
      },
      {
        clubId: "tischtennisverein-h-xter-42505",
        label: "Erwachsene II",
        weekday: "saturday",
        weekSlot: "A",
        hall: "2",
        startTime: "14:30"
      }
    ]);
  });
});
