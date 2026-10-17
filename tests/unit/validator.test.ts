import { describe, expect, it } from "vitest";
import type { MatchDetail, MatchEntry } from "../../src/types.js";
import { shouldInspectMatch, validateMatch } from "../../src/validator.js";
import { isPastMatch } from "../../src/match-detail.js";

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
  it("rechecks approved reports while retaining every substantive check and rejecting future/unknown dates", () => {
    const match = createMatch({ isApproved: true });
    const detail = createDetail({ isAlreadyApproved: true });
    expect(shouldInspectMatch(match)).toBe(false);
    expect(shouldInspectMatch(match, true)).toBe(true);
    expect(shouldInspectMatch(createMatch({ status: "offen" }), true)).toBe(false);
    expect(validateMatch(match, detail).isApprovable).toBe(false);
    expect(validateMatch(match, detail, true).isApprovable).toBe(true);
    detail.homeTeam.hasMF = false;
    expect(validateMatch(match, detail, true).checks).toContainEqual({ rule: "mf-present", passed: false, reason: "MF missing for TSV Eintracht Belle" });
    const now = new Date(2026, 9, 17, 12).getTime();
    expect(isPastMatch(match, now)).toBe(true);
    expect(isPastMatch(createMatch({ date: "17.10.2026 20:00" }), now)).toBe(false);
    expect(isPastMatch(createMatch({ date: "unknown" }), now)).toBe(false);
    expect(isPastMatch(createMatch({ date: "31.02.2026 20:00" }), now)).toBe(false);
  });
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

  it("accepts Mannschaftsführer comments with Arabic team numbers", () => {
    const base = createDetail();
    const detail = createDetail({
      homeTeam: { ...base.homeTeam, teamName: "TuS Bad Wünnenberg II", hasMF: false },
      guestTeam: { ...base.guestTeam, teamName: "TTV Höxter II", hasMF: false },
      bemerkungen: "Mannschaftsführer Tus Bad Wünnenberg 2: Markus Franke TTV Höxter 2: Tarik Özdemir"
    });
    expect(validateMatch(createMatch(), detail).isApprovable).toBe(true);
    detail.bemerkungen = "Mannschaftsführer Tus Bad Wünnenberg 2: Markus Franke";
    expect(validateMatch(createMatch(), detail).checks.find((check) => check.rule === "mf-comment-review")?.reason)
      .toContain("TTV Höxter II");
    detail.bemerkungen = "MF TuS Bad Wünnenberg III: Markus Franke TTV Höxter III: Tarik Özdemir";
    expect(validateMatch(createMatch(), detail).isApprovable).toBe(false);
  });

  it.each(["MF A5 / B4", "Mannschaftsführer A3 und B3", "Manschaftsführer A3 und B3"])("accepts structured MF markers: %s", (bemerkungen) => {
    const base = createDetail();
    const result = validateMatch(
      createMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
      createDetail({
        homeTeam: { teamName: "SC Wewer", hasMF: false, playerCount: 6, players: base.homeTeam.players },
        guestTeam: { teamName: "SV Heide Paderborn", hasMF: false, playerCount: 6, players: base.guestTeam.players },
        bemerkungen
      })
    );
    expect(result.isApprovable).toBe(true);
  });

  it.each(["", "Manschaftsführer A3", "Manschaftsführer vorhanden"])("does not exempt both teams without both captain references: %s", (bemerkungen) => {
    const base = createDetail();
    const result = validateMatch(createMatch(), createDetail({
      homeTeam: { ...base.homeTeam, hasMF: false }, guestTeam: { ...base.guestTeam, hasMF: false }, bemerkungen
    }));
    expect(result.isApprovable).toBe(false);
    expect(result.checks.some((check) => !check.passed)).toBe(true);
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
    expect(result.checks.find((check) => check.rule === "mf-comment-review")?.passed).toBe(false);
  });

  it.each([
    "M.F.: A-3 / B.4", "Mannschaftsfuehrer: A 3 und B 4", "Mannschaftsführerin A3/B3",
    "Kapitäne A3/B3", "Captain: A3 und B3",
    "Spielführer: Heim: Markus Franke / Gast: Tarik Özdemir",
    "MF: Heim – Markus Franke; Gast – Tarik Özdemir",
    "MF TuS Bad Wünnenberg II = Markus Franke; TTV Höxter 2 - Tarik Özdemir",
    "MF: Markus Franke / Tarik Özdemir", "MF: Franke, Markus; Özdemir, Tarik"
  ])("recognizes generic captain comments: %s", (bemerkungen) => {
    const base = createDetail();
    const detail = createDetail({
      homeTeam: { ...base.homeTeam, teamName: "TuS Bad Wünnenberg II", hasMF: false,
        players: base.homeTeam.players.map((player, i) => i === 0 ? { ...player, name: "Franke, Markus" } : player) },
      guestTeam: { ...base.guestTeam, teamName: "TTV Höxter II", hasMF: false,
        players: base.guestTeam.players.map((player, i) => i === 0 ? { ...player, name: "Özdemir, Tarik" } : player) },
      bemerkungen
    });
    expect(validateMatch(createMatch(), detail).isApprovable).toBe(true);
  });

  it.each(["A3/B3", "MF vorhanden", "MF A3", "MF fehlt: A3 und B3", "Keine Mannschaftsführer A3/B3", "Neue Bälle verwendet"])(
    "requires review instead of a missing-MF fine for ambiguous comments: %s", (bemerkungen) => {
      const base = createDetail();
      const detail = createDetail({ homeTeam: { ...base.homeTeam, hasMF: false },
        guestTeam: { ...base.guestTeam, hasMF: false }, bemerkungen });
      const result = validateMatch(createMatch(), detail);
      expect(result.isApprovable).toBe(false);
      expect(result.checks.find((check) => check.rule === "mf-comment-review")?.passed).toBe(false);
      expect(result.checks.some((check) => check.rule === "mf-present" && !check.passed)).toBe(false);
    }
  );
});
