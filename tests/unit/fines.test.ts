import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Workbook } from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { deriveFineCandidates, getStatusFineCandidateState, loadFineWorkbookIndex, syncFineWorkbook } from "../../src/fines.js";
import type { FineCatalogue, MatchAction, MatchEntry } from "../../src/types.js";

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
        naKosten: 125,
        fineCatalogue: null
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
        naKosten: 100,
        fineCatalogue: null
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
        naKosten: 100,
        fineCatalogue: null
      }
    );

    expect(candidates).toHaveLength(0);
  });

  it("applies the matching season and league catalogue entry", () => {
    const fineCatalogue: FineCatalogue = {
      seasons: {
        "2025-2026": {
          leagues: {
            "*": {
              events: {
                [ "nicht-angetreten" ]: {
                  rechtsgrundlage: "Default 2025",
                  kosten: 90
                }
              }
            },
            Bezirksoberliga: {
              events: {
                [ "nicht-angetreten" ]: {
                  grund: "Nicht angetreten BOL",
                  rechtsgrundlage: "BOL 2025",
                  kosten: 125
                }
              }
            }
          }
        },
        "2026-2027": {
          leagues: {
            Bezirksoberliga: {
              events: {
                [ "nicht-angetreten" ]: {
                  rechtsgrundlage: "BOL 2026",
                  kosten: 150
                }
              }
            }
          }
        }
      }
    };

    const candidates = deriveFineCandidates(
      [],
      [
        baseMatch({ date: "03.10.2025 20:00", liga: "Bezirksoberliga", status: "nicht angetreten", points: "2:0" }),
        baseMatch({ date: "03.10.2025 20:00", liga: "1. Bezirksliga", status: "nicht angetreten", points: "2:0" }),
        baseMatch({ date: "03.10.2026 20:00", liga: "Bezirksoberliga", status: "nicht angetreten", points: "2:0" })
      ],
      {
        defaultLiga: null,
        defaultGruppe: "",
        spielleiter: "Timo Klerx",
        naKosten: 100,
        fineCatalogue
      }
    );

    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({ grund: "Nicht angetreten BOL", rechtsgrundlage: "BOL 2025", kosten: 125 });
    expect(candidates[1]).toMatchObject({ grund: "Nicht angetreten", rechtsgrundlage: "Default 2025", kosten: 90 });
    expect(candidates[2]).toMatchObject({ grund: "Nicht angetreten", rechtsgrundlage: "BOL 2026", kosten: 150 });
  });

  it("uses catalogue patterns to classify click-TT error text", () => {
    const action: MatchAction = {
      match: baseMatch({ homeTeam: "SC Wewer", guestTeam: "SV Heide Paderborn" }),
      action: "skipped",
      validation: {
        isApprovable: false,
        checks: [
          {
            rule: "error-messages",
            passed: false,
            reason: "error message found: Falsche Einzelaufstellung laut Vorgabe der Spielstärke!"
          }
        ]
      }
    };

    const candidates = deriveFineCandidates([action], [], {
      defaultLiga: null,
      defaultGruppe: "",
      spielleiter: "Timo Klerx",
      naKosten: 100,
      fineCatalogue: {
        seasons: {
          "2025-2026": {
            events: {
              "error-message": {
                patterns: [
                  {
                    match: "Falsche Einzelaufstellung",
                    grund: "Falsche Einzel- oder Doppelaufstellung",
                    rechtsgrundlage: "A 20.1.5 b",
                    kosten: 10
                  }
                ]
              }
            }
          }
        }
      }
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      grund: "Falsche Einzel- oder Doppelaufstellung",
      rechtsgrundlage: "A 20.1.5 b",
      kosten: 10
    });
    expect(candidates[0]?.bemerkung).toContain("Falsche Einzelaufstellung laut Vorgabe der Spielstärke");
  });

  it("applies lowest-team overrides only for explicitly listed teams", () => {
    const fineCatalogue: FineCatalogue = {
      seasons: {
        "2025-2026": {
          leagues: {
            Bezirksoberliga: {
              lowestTeams: ["TTS Detmold III"],
              events: {
                "nicht-angetreten": {
                  grund: "Nichtantreten einer Mannschaft",
                  rechtsgrundlage: "A 20.1.1",
                  kosten: 100,
                  lowestTeam: {
                    kosten: 50
                  }
                }
              }
            }
          }
        }
      }
    };

    const candidates = deriveFineCandidates(
      [],
      [
        baseMatch({ guestTeam: "TTS Detmold III", status: "nicht angetreten", points: "2:0" }),
        baseMatch({ guestTeam: "TTS Detmold II", status: "nicht angetreten", points: "2:0" })
      ],
      {
        defaultLiga: null,
        defaultGruppe: "",
        spielleiter: "Timo Klerx",
        naKosten: 100,
        fineCatalogue
      }
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ strafeGegen: "TTS Detmold III", kosten: 50 });
    expect(candidates[1]).toMatchObject({ strafeGegen: "TTS Detmold II", kosten: 100 });
  });
});

describe("syncFineWorkbook", () => {
  it("adds the metadata columns and appends only missing candidates", async () => {
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
      [["Bezirksoberliga", "", "Hinserie", "03.10.2025", "", "TuRa Elsen III", "TTS Detmold", "TTS Detmold", "Nicht angetreten", "A 20.1.1", "", 100, "Timo Klerx"]]
    );

    const result = await syncFineWorkbook({
      workbookPath,
      sheetName: "Sheet1",
      ignoreColumnName: "Ignore",
      spielleiter: "Timo Klerx",
      defaultLiga: "Bezirksoberliga",
      defaultGruppe: "",
      naKosten: 100,
      fineCatalogue: null,
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
    expect(worksheet?.getCell(1, 14).value).toBe("Eingetragen am");
    expect(worksheet?.getCell(1, 15).value).toBe("Click-TT Text");
    expect(worksheet?.getCell(1, 16).value).toBe("Ignore");
    expect(worksheet?.rowCount).toBe(3);
    expect(worksheet?.getCell(3, 9).value).toBe("Falsche Einzelaufstellung laut Vorgabe der Spielstärke!");
    expect(worksheet?.getCell(3, 15).value).toBe("Falsche Einzelaufstellung laut Vorgabe der Spielstärke!");
    expect(result.catalogueMatches?.[1]).toMatchObject({
      event: "error-message",
      clickTtText: "Falsche Einzelaufstellung laut Vorgabe der Spielstärke!",
      state: "appended"
    });
    const dateValue = worksheet?.getCell(3, 4).value;
    expect(dateValue instanceof Date).toBe(true);
    expect(worksheet?.getCell(3, 4).numFmt).toBe("dd.mm.yyyy");
    const addedAtValue = worksheet?.getCell(3, 14).value;
    expect(addedAtValue instanceof Date).toBe(true);
    expect(worksheet?.getCell(3, 14).numFmt).toBe("yyyy-mm-dd hh:mm:ss");
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
        "Eingetragen am",
        "Ignore"
      ],
      [["Bezirksoberliga", "", "Hinserie", "03.10.2025", "", "SC Wewer", "SV Heide Paderborn", "SV Heide Paderborn", "MF fehlt", "", "MF missing for SV Heide Paderborn", "", "Timo Klerx", "", "x"]]
    );

    const result = await syncFineWorkbook({
      workbookPath,
      sheetName: "Sheet1",
      ignoreColumnName: "Ignore",
      spielleiter: "Timo Klerx",
      defaultLiga: "Bezirksoberliga",
      defaultGruppe: "",
      naKosten: 100,
      fineCatalogue: null,
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
      fineCatalogue: null,
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
        "Eingetragen am",
        "Ignore"
      ],
      [["Bezirksoberliga", "", "Hinserie", "03.10.2025", "", "TuRa Elsen III", "TTS Detmold", "TTS Detmold", "Nicht angetreten", "A 20.1.1", "", 100, "Timo Klerx", "", ""]]
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
        naKosten: 100,
        fineCatalogue: null
      }
    );

    expect(state).toBe("existing");
  });
});
