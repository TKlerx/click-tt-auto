import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/raster/score/index.js";
import type { Assignment, SeasonModel } from "../../src/raster/types.js";

const execFileAsync = promisify(execFile);

/**
 * One club, one hall that fits one match at a time, two teams:
 * a Verbandsliga team whose Rasterzahl the WTTV planner already fixed, and a
 * Bezirksliga team this run has to place around it.
 *
 * Both play Friday in hall 1, and both groups have the same raster, so equal
 * Rasterzahlen mean identical home weeks. If the fixed Verbandsliga team
 * occupies the hall, the Bezirksliga team cannot share its number.
 */
function clubWithUpperLeagueTeam(options?: {
  upperLeagueCapacityRelevant?: boolean;
}): SeasonModel {
  return {
    clubs: [
      {
        id: "tura-elsen",
        name: "TuRa Elsen",
        venues: [
          { hall: "1", name: "Halle 1", capacityByWeekday: { friday: 1 } },
        ],
        notes: "",
      },
      { id: "filler-club", name: "Filler", venues: [], notes: "" },
    ],
    teams: [
      {
        id: "verbandsliga-tura-elsen-i",
        clubId: "tura-elsen",
        label: "I",
        group: { league: "Verbandsliga", name: "Verbandsliga 1" },
        homeWeekday: "friday",
        hall: "1",
        // The number the WTTV planner published in the Gruppen-und-Raster PDF.
        rasterzahl: { kind: "fixed", value: 1 },
        confidence: "ok",
        ...(options?.upperLeagueCapacityRelevant === false
          ? { capacityRelevant: false }
          : {}),
      },
      {
        id: "bezirksliga-tura-elsen-ii",
        clubId: "tura-elsen",
        label: "II",
        group: { league: "Bezirksliga", name: "Bezirksliga 1" },
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok",
      },
      {
        id: "verbandsliga-filler",
        clubId: "filler-club",
        label: "F1",
        group: { league: "Verbandsliga", name: "Verbandsliga 1" },
        homeWeekday: "tuesday",
        hall: "9",
        rasterzahl: { kind: "fixed", value: 2 },
        confidence: "ok",
      },
      {
        id: "bezirksliga-filler",
        clubId: "filler-club",
        label: "F2",
        group: { league: "Bezirksliga", name: "Bezirksliga 1" },
        homeWeekday: "tuesday",
        hall: "9",
        rasterzahl: { kind: "fixed", value: 2 },
        confidence: "ok",
      },
    ],
    groups: [
      {
        ref: { league: "Verbandsliga", name: "Verbandsliga 1" },
        size: 10,
        teamIds: ["verbandsliga-tura-elsen-i", "verbandsliga-filler"],
      },
      {
        ref: { league: "Bezirksliga", name: "Bezirksliga 1" },
        size: 10,
        teamIds: ["bezirksliga-tura-elsen-ii", "bezirksliga-filler"],
      },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
}

async function solve(model: SeasonModel): Promise<Assignment> {
  const dir = await mkdtemp(path.join(tmpdir(), "upper-league-capacity-"));
  try {
    const modelPath = path.join(dir, "model.json");
    const outPath = path.join(dir, "assignment.json");
    const metadataPath = path.join(dir, "metadata.json");
    await writeFile(modelPath, JSON.stringify(model), "utf8");

    await execFileAsync(
      "uv",
      [
        "run",
        "--python",
        "3.12",
        "scripts/solve-raster-cpsat.py",
        "--model",
        modelPath,
        "--out",
        outPath,
        "--metadata",
        metadataPath,
        "--time-limit",
        "30",
      ],
      { cwd: process.cwd(), timeout: 120_000 },
    );

    return JSON.parse(await readFile(outPath, "utf8")) as Assignment;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("upper-league Rasterzahl occupies hall capacity", () => {
  // The assertion that matters: a fixed Verbandsliga number must consume the
  // club's hall on its home weeks, not merely sit in the model looking correct.
  it("counts a fixed Verbandsliga team against its club's hall", () => {
    const model = clubWithUpperLeagueTeam();
    const collide: Assignment = {
      "verbandsliga-tura-elsen-i": 1,
      // Same raster, same number, so the same home weeks as the 1st team.
      "bezirksliga-tura-elsen-ii": 1,
      "verbandsliga-filler": 2,
      "bezirksliga-filler": 2,
    };

    const overUsages = evaluate(model, collide).overUsages;

    expect(overUsages.length).toBeGreaterThan(0);
    expect(overUsages[0]!.clubId).toBe("tura-elsen");
    expect(overUsages[0]!.hall).toBe("1");
    expect(overUsages[0]!.weekday).toBe("friday");
  });

  // Guard against the silent failure mode: a team carrying capacityRelevant
  // false keeps its Rasterzahl and vanishes from capacity accounting. Any wiring
  // that injects upper-league teams without their wish lands here.
  it("stops counting it once the team is marked capacity-irrelevant", () => {
    const model = clubWithUpperLeagueTeam({
      upperLeagueCapacityRelevant: false,
    });
    const collide: Assignment = {
      "verbandsliga-tura-elsen-i": 1,
      "bezirksliga-tura-elsen-ii": 1,
      "verbandsliga-filler": 2,
      "bezirksliga-filler": 2,
    };

    expect(evaluate(model, collide).overUsages).toEqual([]);
  });

  it("makes the solver place the Bezirksliga team clear of it", async () => {
    const model = clubWithUpperLeagueTeam();

    const assignment = await solve(model);

    // The fixed number is honoured...
    expect(assignment["verbandsliga-tura-elsen-i"]).toBe(1);
    // ...and the 2nd team is kept off it, because sharing the number would mean
    // sharing every home week in a hall that fits one match.
    expect(assignment["bezirksliga-tura-elsen-ii"]).not.toBe(1);
    // Scored by the TypeScript evaluator rather than the solver, so the two
    // agree independently that nothing overruns the hall.
    expect(evaluate(model, assignment).overUsages).toEqual([]);
  }, 120_000);
});
