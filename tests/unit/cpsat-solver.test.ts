import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { optimize } from "../../src/raster/optimize/index.js";
import { evaluate } from "../../src/raster/score/index.js";
import type { Assignment, SeasonModel } from "../../src/raster/types.js";

const execFileAsync = promisify(execFile);

function knownOptimumModel(): SeasonModel {
  return {
    clubs: [
      {
        id: "target",
        name: "Target Club",
        venues: [
          { hall: "1", name: "Hall 1", capacityByWeekday: { friday: 1, thursday: 1, tuesday: 1 } }
        ],
        notes: ""
      },
      { id: "anchor-a", name: "Anchor A", venues: [], notes: "" },
      { id: "anchor-b", name: "Anchor B", venues: [], notes: "" },
      { id: "anchor-c", name: "Anchor C", venues: [], notes: "" }
    ],
    teams: [
      {
        id: "anchor-12-a",
        clubId: "anchor-a",
        label: "Anchor 12 A",
        group: { league: "L", name: "G12A" },
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 1 },
        confidence: "ok"
      },
      {
        id: "target-12-a",
        clubId: "target",
        label: "Target 12 A",
        group: { league: "L", name: "G12A" },
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      },
      {
        id: "anchor-12-b",
        clubId: "anchor-b",
        label: "Anchor 12 B",
        group: { league: "L", name: "G12B" },
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 2 },
        confidence: "ok"
      },
      {
        id: "target-12-b",
        clubId: "target",
        label: "Target 12 B",
        group: { league: "L", name: "G12B" },
        homeWeekday: "thursday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      },
      {
        id: "anchor-10",
        clubId: "anchor-c",
        label: "Anchor 10",
        group: { league: "L", name: "G10" },
        homeWeekday: "tuesday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 1 },
        confidence: "ok"
      },
      {
        id: "target-10",
        clubId: "target",
        label: "Target 10",
        group: { league: "L", name: "G10" },
        homeWeekday: "tuesday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      }
    ],
    groups: [
      { ref: { league: "L", name: "G12A" }, size: 12, teamIds: ["anchor-12-a", "target-12-a"] },
      { ref: { league: "L", name: "G12B" }, size: 12, teamIds: ["anchor-12-b", "target-12-b"] },
      { ref: { league: "L", name: "G10" }, size: 10, teamIds: ["anchor-10", "target-10"] }
    ],
    wishes: [
      {
        clubId: "target",
        teamA: "anchor-12-a",
        teamB: "target-12-a",
        relation: "wechsel",
        source: "freetext",
        confidence: "ok"
      },
      {
        clubId: "target",
        teamA: "anchor-12-b",
        teamB: "target-12-b",
        relation: "wechsel",
        source: "freetext",
        confidence: "ok"
      },
      {
        clubId: "target",
        teamA: "anchor-10",
        teamB: "target-10",
        relation: "wechsel",
        source: "freetext",
        confidence: "ok"
      }
    ],
    absoluteConstraints: [],
    warnings: []
  };
}

const knownAssignment = {
  "anchor-12-a": 1,
  "target-12-a": 7,
  "anchor-12-b": 2,
  "target-12-b": 8,
  "anchor-10": 1,
  "target-10": 6
};

function fixedSt4DerbyModel(): SeasonModel {
  return {
    clubs: [{ id: "elsen", name: "TuRa Elsen", venues: [], notes: "" }],
    teams: [
      {
        id: "elsen-1",
        clubId: "elsen",
        label: "TuRa Elsen I",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 3 },
        confidence: "ok"
      },
      {
        id: "elsen-2",
        clubId: "elsen",
        label: "TuRa Elsen II",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 4 },
        confidence: "ok"
      }
    ],
    groups: [{ ref: { league: "L", name: "G12" }, size: 12, teamIds: ["elsen-1", "elsen-2"] }],
    wishes: [],
    absoluteConstraints: [],
    warnings: []
  };
}

function fiveTeamModelWithFixedSix(): SeasonModel {
  const teams = Array.from({ length: 5 }, (_, index) => ({
    id: `team-${index + 1}`,
    clubId: `club-${index + 1}`,
    label: `Team ${index + 1}`,
    homeWeekday: "friday" as const,
    hall: "1",
    rasterzahl:
      index === 0
        ? ({ kind: "fixed", value: 6 } as const)
        : ({ kind: "assignable" } as const),
    confidence: "ok" as const
  }));
  return {
    clubs: teams.map((team) => ({
      id: team.clubId,
      name: team.clubId,
      venues: [],
      notes: ""
    })),
    teams,
    groups: [
      {
        ref: { league: "L", name: "G5" },
        size: 5,
        teamIds: teams.map((team) => team.id)
      }
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: []
  };
}

describe("CP-SAT raster solver", () => {
  it("finds a known optimum across multiple groups and hall constraints", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = knownOptimumModel();
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
          "30"
        ],
        { cwd: process.cwd(), timeout: 120_000 }
      );

      const assignment = JSON.parse(await readFile(outPath, "utf8")) as Assignment;
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { status: string };

      expect(metadata.status).toBe("OPTIMAL");
      expect(assignment).toEqual(knownAssignment);
      expect(evaluate(model, assignment).objective).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("allows a 5-team group to use schedule number 6", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = fiveTeamModelWithFixedSix();
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
          "30"
        ],
        { cwd: process.cwd(), timeout: 120_000 }
      );

      const assignment = JSON.parse(await readFile(outPath, "utf8")) as Assignment;

      expect(assignment["team-1"]).toBe(6);
      expect(evaluate(model, assignment).hardViolations).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("charges the ST4 fallback penalty for same-club derbies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = fixedSt4DerbyModel();
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
          "30"
        ],
        { cwd: process.cwd(), timeout: 120_000 }
      );

      const assignment = JSON.parse(await readFile(outPath, "utf8")) as Assignment;
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { objective: number; status: string };

      expect(metadata.status).toBe("OPTIMAL");
      expect(metadata.objective).toBe(1000);
      expect(evaluate(model, assignment).objective).toBe(1000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("shows the heuristic can miss the same known optimum", () => {
    const model = knownOptimumModel();
    const assignment = optimize(model);
    const result = evaluate(model, assignment);

    expect(assignment).not.toEqual(knownAssignment);
    expect(result.objective).toBeGreaterThan(0);
  });
});
