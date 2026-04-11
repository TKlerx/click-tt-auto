import { describe, expect, it } from "vitest";
import type { MatchDetail, MatchEntry } from "../../src/types.js";
import { validateMatch } from "../../src/validator.js";

function createMatch(overrides: Partial<MatchEntry> = {}): MatchEntry {
  return {
    index: 0,
    date: "10.10.2025 20:00",
    homeTeam: "TSV Eintracht Belle",
    guestTeam: "TTC Paderborn",
    scoreHome: 9,
    scoreGuest: 0,
    status: "abgeschlossen",
    points: "2:0",
    isApproved: false,
    erfassenUrl: "/match/1",
    group: "Bezirksoberliga Erwachsene",
    ...overrides
  };
}

function createDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    matchFormat: "Spielbetrieb Ergebniserfassung (Sechser-Paarkreuz-System)",
    homeTeam: {
      teamName: "TSV Eintracht Belle",
      hasMF: true,
      mfName: "Alice",
      playerCount: 6,
      players: [
        { position: 1, name: "A1", rank: "1.1" },
        { position: 2, name: "A2", rank: "1.2" },
        { position: 3, name: "A3", rank: "1.3" },
        { position: 4, name: "A4", rank: "1.4" },
        { position: 5, name: "A5", rank: "1.5" },
        { position: 6, name: "A6", rank: "1.6" }
      ]
    },
    guestTeam: {
      teamName: "TTC Paderborn",
      hasMF: true,
      mfName: "Bob",
      playerCount: 6,
      players: [
        { position: 1, name: "B1", rank: "2.1" },
        { position: 2, name: "B2", rank: "2.2" },
        { position: 3, name: "B3", rank: "2.3" },
        { position: 4, name: "B4", rank: "2.4" },
        { position: 5, name: "B5", rank: "2.5" },
        { position: 6, name: "B6", rank: "2.6" }
      ]
    },
    hasErrorMessages: false,
    bemerkungen: "",
    isAlreadyApproved: false,
    ...overrides
  };
}

describe("validateMatch", () => {
  it("passes the clean approvable case", () => {
    const result = validateMatch(createMatch(), createDetail());
    expect(result.isApprovable).toBe(true);
  });

  it("fails when status is not abgeschlossen", () => {
    const result = validateMatch(createMatch({ status: "nicht angetreten" }), createDetail());
    expect(result.isApprovable).toBe(false);
    expect(result.checks.find((check) => check.rule === "status")?.reason).toContain("nicht angetreten");
  });

  it("fails when unexpected error content is present", () => {
    const result = validateMatch(createMatch(), createDetail({ hasErrorMessages: true, errorMessageText: "falsche Aufstellung" }));
    expect(result.isApprovable).toBe(false);
    expect(result.checks.find((check) => check.rule === "error-messages")?.reason).toContain("falsche Aufstellung");
  });

  it("fails when MF is missing", () => {
    const base = createDetail();
    const result = validateMatch(
      createMatch(),
      createDetail({
        homeTeam: { teamName: "TSV Eintracht Belle", hasMF: false, playerCount: 6, players: base.homeTeam.players },
        guestTeam: { teamName: "TTC Paderborn", hasMF: false, playerCount: 6, players: base.guestTeam.players }
      })
    );
    expect(result.isApprovable).toBe(false);
    expect(result.checks.find((check) => check.rule === "mf-present")?.reason).toContain("MF missing");
  });

  it("fails when a team has fewer than six players", () => {
    const base = createDetail();
    const result = validateMatch(
      createMatch(),
      createDetail({
        guestTeam: {
          teamName: "TTC Paderborn",
          hasMF: true,
          playerCount: 5,
          players: base.guestTeam.players.slice(0, 5)
        }
      })
    );
    expect(result.isApprovable).toBe(false);
    expect(result.checks.find((check) => check.rule === "player-count")?.reason).toContain("guest has 5");
  });

  it("reports multiple rule failures together", () => {
    const result = validateMatch(
      createMatch({ status: "offen" }),
      createDetail({
        matchFormat: "Vierer-Paarkreuz-System",
        hasErrorMessages: true,
        errorMessageText: "Warnung"
      })
    );
    expect(result.isApprovable).toBe(false);
    expect(result.checks.filter((check) => !check.passed)).toHaveLength(3);
  });

  it("accepts MF mentions from Bemerkungen", () => {
    const base = createDetail();
    const result = validateMatch(
      createMatch(),
      createDetail({
        homeTeam: { teamName: "TSV Eintracht Belle", hasMF: false, playerCount: 6, players: base.homeTeam.players },
        guestTeam: { teamName: "TTC Paderborn", hasMF: false, playerCount: 6, players: base.guestTeam.players },
        bemerkungen: "MF TSV Eintracht Belle: Alice, MF TTC Paderborn: Bob"
      })
    );
    expect(result.isApprovable).toBe(true);
  });

  it("accepts structured MF markers in Bemerkungen for both teams", () => {
    const base = createDetail();
    const result = validateMatch(
      createMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
      createDetail({
        homeTeam: { teamName: "SC Wewer", hasMF: false, playerCount: 6, players: base.homeTeam.players },
        guestTeam: { teamName: "SV Heide Paderborn", hasMF: false, playerCount: 6, players: base.guestTeam.players },
        bemerkungen: "MF A5 / B4"
      })
    );
    expect(result.isApprovable).toBe(true);
  });

  it("does not accept a bare MF mention without identifying both sides", () => {
    const base = createDetail();
    const result = validateMatch(
      createMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
      createDetail({
        homeTeam: { teamName: "SC Wewer", hasMF: false, playerCount: 6, players: base.homeTeam.players },
        guestTeam: { teamName: "SV Heide Paderborn", hasMF: false, playerCount: 6, players: base.guestTeam.players },
        bemerkungen: "MF vorhanden"
      })
    );
    expect(result.isApprovable).toBe(false);
    expect(result.checks.find((check) => check.rule === "mf-present")?.reason).toContain("MF missing");
  });
});
