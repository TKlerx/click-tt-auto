import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Workbook } from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { deriveFineCandidates, getStatusFineCandidateState, loadFineWorkbookIndex, syncFineWorkbook } from "../../src/fines.js";
import type { MatchAction, MatchEntry } from "../../src/types.js";

const tempDirs: string[] = [];

async function createWorkbook(headers: string[], rows: Array<Array<string | number | null>>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "click-tt-fines-"));
  tempDirs.push(dir);
  const workbookPath = path.join(dir, "fines.xlsx");

  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(row);
  }

  await workbook.xlsx.writeFile(workbookPath);
  return workbookPath;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function baseMatch(overrides: Partial<MatchEntry> = {}): MatchEntry {
  return {
    index: 1,
    date: "03.10.2025 20:00",
    homeTeam: "TuRa Elsen III",
    guestTeam: "TTS Detmold",
    scoreHome: 9,
    scoreGuest: 0,
    status: "abgeschlossen",
    points: "2:0",
    isApproved: false,
    erfassenUrl: "/match/1",
    group: "Auswahl Datum Spiellokal Heimmannschaft Gastmannschaft Spiele Status Info Punkte Bericht",
    liga: "Bezirksoberliga",
    gruppe: "",
    ...overrides
  };
}

describe("deriveFineCandidates", () => {
  it("creates candidates for skipped validation reasons and nicht angetreten rows", () => {
    const action: MatchAction = {
      match: baseMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
      action: "skipped",
      validation: {
        isApprovable: false,
        checks: [
          { rule: "status", passed: true },
          { rule: "match-format", passed: true },
          { rule: "error-messages", passed: true },
          { rule: "mf-present", passed: false, reason: "MF missing for SC Wewer; MF missing for SV Heide Paderborn" },
          { rule: "player-count", passed: false, reason: "guest has 5 numbered players" },
          { rule: "already-approved", passed: true }
        ]
      }
    };

    const candidates = deriveFineCandidates(
      [action],
      [baseMatch({ status: "nicht angetreten", points: "2:0", isApproved: true })],
      {
        defaultLiga: "Bezirksoberliga",
        defaultGruppe: "",
        spielleiter: "Timo Klerx",
        naKosten: 125
      }
    );

    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toMatchObject({
      liga: "Bezirksoberliga",
      gruppe: "",
      grund: "Nicht angetreten",
      strafeGegen: "TTS Detmold",
      rechtsgrundlage: "A 20.1.1",
      kosten: 125
    });
    expect(candidates[0]?.bemerkung).toContain("Status: Nicht angetreten");
    expect(candidates[0]?.bemerkung).toContain("bereits markiert");
    expect(candidates.some((candidate) => candidate.strafeGegen === "SC Wewer" && candidate.grund === "MF fehlt")).toBe(true);
    expect(candidates.some((candidate) => candidate.strafeGegen === "SV Heide Paderborn" && candidate.grund === "MF fehlt")).toBe(true);
    expect(
      candidates.some((candidate) => candidate.strafeGegen === "SV Heide Paderborn" && candidate.grund === "Unvollständige Einzelaufstellung")
    ).toBe(true);
    expect(candidates.find((candidate) => candidate.grund === "MF fehlt")?.bemerkung).toContain("MF missing for SC Wewer");
    expect(candidates.find((candidate) => candidate.grund === "MF fehlt")?.bemerkung).toContain("guest has 5 numbered players");
  });

  it("derives Rückserie for matches at the beginning of the year", () => {
    const candidates = deriveFineCandidates(
      [],
      [baseMatch({ date: "12.01.2026 19:30", status: "nicht angetreten", points: "2:0" })],
      {
        defaultLiga: "Bezirksoberliga",
        defaultGruppe: "",
        spielleiter: "Timo Klerx",
        naKosten: 100
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.serie).toBe("Rückserie");
  });
  it("ignores ordinary abgeschlossen rows in status fine matches", () => {
    const candidates = deriveFineCandidates(
      [],
      [baseMatch({ status: "abgeschlossen", points: "2:0" })],
      {
        defaultLiga: "Bezirksoberliga",
        defaultGruppe: "",
        spielleiter: "Timo Klerx",
        naKosten: 100
      }
    );

    expect(candidates).toHaveLength(0);
  });
});

describe("syncFineWorkbook", () => {
  it("adds the ignore column and appends only missing candidates", async () => {
    const workbookPath = await createWorkbook(
      [
        "Liga",
        "Gruppe",
        "Serie",
        "Datum",
        "Spielnummer",
        "Heim",
        "Gast",
        "Strafe gegen",
        "Grund",
        "Rechtsgrundlage",
        "Bemerkung",
        "Kosten",
        "Spielleiter"
      ],
      [
        ["Bezirksoberliga", "", "Hinserie", "03.10.2025", "", "TuRa Elsen III", "TTS Detmold", "TTS Detmold", "Nicht angetreten", "A 20.1.1", "", 100, "Timo Klerx"]
      ]
    );

    const result = await syncFineWorkbook({
      workbookPath,
      sheetName: "Sheet1",
      ignoreColumnName: "Ignore",
      spielleiter: "Timo Klerx",
      defaultLiga: "Bezirksoberliga",
      defaultGruppe: "",
      naKosten: 100,
      actions: [
        {
          match: baseMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
          action: "skipped",
          validation: {
            isApprovable: false,
            checks: [
              { rule: "status", passed: true },
              { rule: "match-format", passed: true },
              { rule: "error-messages", passed: false, reason: "error message found: Falsche Einzelaufstellung laut Vorgabe der Spielstärke!" },
              { rule: "mf-present", passed: true },
              { rule: "player-count", passed: true },
              { rule: "already-approved", passed: true }
            ]
          }
        }
      ],
      statusFineMatches: [baseMatch({ status: "nicht angetreten", points: "2:0" })]
    });

    expect(result).toMatchObject({
      enabled: true,
      totalCandidates: 2,
      appended: 1,
      existing: 1,
      ignored: 0
    });

    const workbook = new Workbook();
    await workbook.xlsx.readFile(workbookPath);
    const worksheet = workbook.getWorksheet("Sheet1");
    expect(worksheet?.getCell(1, 14).value).toBe("Ignore");
    expect(worksheet?.rowCount).toBe(3);
    expect(worksheet?.getCell(3, 9).value).toBe("Falsche Einzelaufstellung laut Vorgabe der Spielstärke!");
  });

  it("does not append candidates whose existing row is marked ignored", async () => {
    const workbookPath = await createWorkbook(
      [
        "Liga",
        "Gruppe",
        "Serie",
        "Datum",
        "Spielnummer",
        "Heim",
        "Gast",
        "Strafe gegen",
        "Grund",
        "Rechtsgrundlage",
        "Bemerkung",
        "Kosten",
        "Spielleiter",
        "Ignore"
      ],
      [
        ["Bezirksoberliga", "", "Hinserie", "03.10.2025", "", "SC Wewer", "SV Heide Paderborn", "SV Heide Paderborn", "MF fehlt", "", "MF missing for SV Heide Paderborn", "", "Timo Klerx", "x"]
      ]
    );

    const result = await syncFineWorkbook({
      workbookPath,
      sheetName: "Sheet1",
      ignoreColumnName: "Ignore",
      spielleiter: "Timo Klerx",
      defaultLiga: "Bezirksoberliga",
      defaultGruppe: "",
      naKosten: 100,
      actions: [
        {
          match: baseMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
          action: "skipped",
          validation: {
            isApprovable: false,
            checks: [
              { rule: "status", passed: true },
              { rule: "match-format", passed: true },
              { rule: "error-messages", passed: true },
              { rule: "mf-present", passed: false, reason: "MF missing for SV Heide Paderborn" },
              { rule: "player-count", passed: true },
              { rule: "already-approved", passed: true }
            ]
          }
        }
      ],
      statusFineMatches: []
    });

    expect(result).toMatchObject({
      totalCandidates: 1,
      appended: 0,
      existing: 0,
      ignored: 1
    });
  });

  it("reports workbook additions without writing them during dry run", async () => {
    const workbookPath = await createWorkbook(
      [
        "Liga",
        "Gruppe",
        "Serie",
        "Datum",
        "Spielnummer",
        "Heim",
        "Gast",
        "Strafe gegen",
        "Grund",
        "Rechtsgrundlage",
        "Bemerkung",
        "Kosten",
        "Spielleiter"
      ],
      []
    );

    const result = await syncFineWorkbook({
      workbookPath,
      sheetName: "Sheet1",
      ignoreColumnName: "Ignore",
      spielleiter: "Timo Klerx",
      defaultLiga: "Bezirksoberliga",
      defaultGruppe: "",
      naKosten: 100,
      dryRun: true,
      actions: [],
      statusFineMatches: [baseMatch({ status: "nicht angetreten", points: "2:0" })]
    });

    expect(result).toMatchObject({
      enabled: true,
      dryRun: true,
      totalCandidates: 1,
      appended: 1,
      existing: 0,
      ignored: 0
    });

    const workbook = new Workbook();
    await workbook.xlsx.readFile(workbookPath);
    const worksheet = workbook.getWorksheet("Sheet1");
    expect(worksheet?.rowCount).toBe(1);
  });

  it("detects when a Nicht angetreten match already exists in the workbook", async () => {
    const workbookPath = await createWorkbook(
      [
        "Liga",
        "Gruppe",
        "Serie",
        "Datum",
        "Spielnummer",
        "Heim",
        "Gast",
        "Strafe gegen",
        "Grund",
        "Rechtsgrundlage",
        "Bemerkung",
        "Kosten",
        "Spielleiter",
        "Ignore"
      ],
      [
        ["Bezirksoberliga", "", "Hinserie", "03.10.2025", "", "TuRa Elsen III", "TTS Detmold", "TTS Detmold", "Nicht angetreten", "A 20.1.1", "", 100, "Timo Klerx", ""]
      ]
    );

    const workbookIndex = await loadFineWorkbookIndex({
      workbookPath,
      sheetName: "Sheet1",
      ignoreColumnName: "Ignore"
    });

    const state = getStatusFineCandidateState(
      baseMatch({ status: "nicht angetreten", points: "2:0", isApproved: true }),
      workbookIndex,
      {
        defaultLiga: "Bezirksoberliga",
        defaultGruppe: "",
        spielleiter: "Timo Klerx",
        naKosten: 100
      }
    );

    expect(state).toBe("existing");
  });
});
