import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { optimize, startingAssignment } from "../../src/raster/optimize/index.js";
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

function staggeredCapacityModel(): SeasonModel {
  return {
    clubs: [
      {
        id: "club",
        name: "Club",
        venues: [{ hall: "1", name: "Hall", capacityByWeekday: { friday: 1 } }],
        notes: ""
      }
    ],
    teams: [
      {
        id: "a",
        clubId: "club",
        label: "Erwachsene",
        homeWeekday: "friday",
        hall: "1",
        startTime: "17:00",
        rasterzahl: { kind: "fixed", value: 6 },
        confidence: "ok"
      },
      {
        id: "b",
        clubId: "club",
        label: "Erwachsene II",
        homeWeekday: "friday",
        hall: "1",
        startTime: "20:00",
        rasterzahl: { kind: "fixed", value: 7 },
        confidence: "ok"
      }
    ],
    groups: [{ ref: { league: "L", name: "G12" }, size: 12, teamIds: ["a", "b"] }],
    wishes: [],
    absoluteConstraints: [],
    warnings: []
  };
}

function fixedSpielwocheRhythmModel(): SeasonModel {
  return {
    clubs: [{ id: "club", name: "Club", venues: [], notes: "" }],
    teams: [
      {
        id: "a",
        clubId: "club",
        label: "Erwachsene",
        homeWeekday: "friday",
        hall: "1",
        spielwochePref: "A",
        rasterzahl: { kind: "fixed", value: 6 },
        confidence: "ok"
      },
      {
        id: "b",
        clubId: "club",
        label: "Erwachsene II",
        homeWeekday: "friday",
        hall: "1",
        spielwochePref: "A",
        rasterzahl: { kind: "fixed", value: 12 },
        confidence: "ok"
      }
    ],
    groups: [{ ref: { league: "L", name: "G12" }, size: 12, teamIds: ["a", "b"] }],
    wishes: [],
    absoluteConstraints: [],
    warnings: []
  };
}

function spielwocheKnownOptimumModel(): SeasonModel {
  const clubs = [
    { id: "club", name: "Club", venues: [], notes: "" },
    { id: "anchor-a", name: "Anchor A", venues: [], notes: "" },
    { id: "anchor-b", name: "Anchor B", venues: [], notes: "" },
    { id: "anchor-c", name: "Anchor C", venues: [], notes: "" }
  ];
  return {
    clubs,
    teams: [
      {
        id: "fixed-a",
        clubId: "club",
        label: "Erwachsene",
        homeWeekday: "friday",
        hall: "1",
        spielwochePref: "A",
        rasterzahl: { kind: "fixed", value: 1 },
        confidence: "ok"
      },
      {
        id: "anchor-a",
        clubId: "anchor-a",
        label: "Anchor A",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 2 },
        confidence: "ok"
      },
      {
        id: "choose-same",
        clubId: "club",
        label: "Erwachsene II",
        homeWeekday: "friday",
        hall: "1",
        spielwochePref: "A",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      },
      {
        id: "anchor-b",
        clubId: "anchor-b",
        label: "Anchor B",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 2 },
        confidence: "ok"
      },
      {
        id: "flexible",
        clubId: "club",
        label: "Erwachsene III",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "assignable" },
        confidence: "ok"
      },
      {
        id: "anchor-c",
        clubId: "anchor-c",
        label: "Anchor C",
        homeWeekday: "friday",
        hall: "1",
        rasterzahl: { kind: "fixed", value: 2 },
        confidence: "ok"
      }
    ],
    groups: [
      { ref: { league: "L", name: "G-fixed" }, size: 12, teamIds: ["fixed-a", "anchor-a"] },
      { ref: { league: "L", name: "G-choice" }, size: 12, teamIds: ["choose-same", "anchor-b"] },
      { ref: { league: "L", name: "G-flex" }, size: 12, teamIds: ["flexible", "anchor-c"] }
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: []
  };
}

function flexibleCapacityKnownOptimumModel(): SeasonModel {
  const model = spielwocheKnownOptimumModel();
  model.clubs[0]!.venues = [
    { hall: "1", name: "Hall", capacityByWeekday: { friday: 1 } }
  ];
  model.clubs = model.clubs.filter((club) => club.id !== "anchor-c");
  model.teams = model.teams.filter(
    (team) => team.id !== "flexible" && team.id !== "anchor-c"
  );
  model.groups = model.groups.filter(
    (group) => group.ref.name !== "G-flex"
  );
  for (const team of model.teams) {
    delete team.spielwochePref;
  }
  return model;
}

function fourFlexibleTeamsCapacityModel(): SeasonModel {
  const clubTeams = ["club-1", "club-2", "club-3", "club-4"];
  return {
    clubs: [
      {
        id: "club",
        name: "Club",
        venues: [{ hall: "1", name: "Hall", capacityByWeekday: { friday: 2 } }],
        notes: ""
      },
      ...clubTeams.map((_, index) => ({
        id: `anchor-${index + 1}`,
        name: `Anchor ${index + 1}`,
        venues: [],
        notes: ""
      }))
    ],
    teams: clubTeams.flatMap((teamId, index) => [
      {
        id: teamId,
        clubId: "club",
        label: `Erwachsene ${index + 1}`,
        homeWeekday: "friday" as const,
        hall: "1",
        rasterzahl: { kind: "assignable" as const },
        confidence: "ok" as const
      },
      {
        id: `anchor-${index + 1}`,
        clubId: `anchor-${index + 1}`,
        label: `Anchor ${index + 1}`,
        homeWeekday: "friday" as const,
        hall: "1",
        rasterzahl: { kind: "fixed" as const, value: 2 },
        confidence: "ok" as const
      }
    ]),
    groups: clubTeams.map((teamId, index) => ({
      ref: { league: "L", name: `G${index + 1}` },
      size: 12,
      teamIds: [teamId, `anchor-${index + 1}`]
    })),
    wishes: [],
    absoluteConstraints: [],
    warnings: []
  };
}

function unavoidableCapacityExcessModel(): SeasonModel {
  return {
    clubs: [
      {
        id: "club",
        name: "Club",
        venues: [{ hall: "1", name: "Hall", capacityByWeekday: { friday: 1 } }],
        notes: ""
      }
    ],
    teams: [1, 2, 3].flatMap((value) => [
      {
        id: `anchor-${value}`,
        clubId: `anchor-${value}`,
        label: `Anchor ${value}`,
        homeWeekday: "friday" as const,
        hall: "1",
        rasterzahl: { kind: "fixed" as const, value: 1 },
        confidence: "ok" as const
      },
      {
        id: `team-${value}`,
        clubId: "club",
        label: `Erwachsene ${value}`,
        homeWeekday: "friday" as const,
        hall: "1",
        startTime: "19:00",
        rasterzahl: { kind: "fixed" as const, value: 6 },
        confidence: "ok" as const
      }
    ]),
    groups: [1, 2, 3].map((value) => ({
      ref: { league: "L", name: `G12-${value}` },
      size: 12,
      teamIds: [`anchor-${value}`, `team-${value}`]
    })),
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

  it("does not penalize same-day hall capacity when match times do not overlap", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = staggeredCapacityModel();
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
      expect(metadata.objective).toBe(0);
      expect(evaluate(model, assignment).objective).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("scores Spielwoche A/B as same-or-opposite rhythm pairs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = fixedSpielwocheRhythmModel();
      const modelPath = path.join(dir, "model.json");
      const outPath = path.join(dir, "assignment.json");
      const metadataPath = path.join(dir, "metadata.json");
      const weightsPath = path.join(dir, "weights.json");
      await writeFile(modelPath, JSON.stringify(model), "utf8");
      await writeFile(
        weightsPath,
        JSON.stringify({
          overUsage: 0,
          overUsageFairness: 0,
          wechsel: 0,
          zeitgleich: 0,
          sameClubDerbySt4: 0,
          spielwoche: 7
        }),
        "utf8"
      );

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
          "--weights",
          weightsPath,
          "--time-limit",
          "30"
        ],
        { cwd: process.cwd(), timeout: 120_000 }
      );

      const assignment = JSON.parse(await readFile(outPath, "utf8")) as Assignment;
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        objective: number;
        status: string;
      };
      const evaluation = evaluate(model, assignment, {
        overUsage: 0,
        overUsageFairness: 0,
        wechsel: 0,
        zeitgleich: 0,
        sameClubDerbySt4: 0,
        spielwoche: 7
      });

      expect(metadata.status).toBe("OPTIMAL");
      expect(metadata.objective).toBe(7);
      expect(evaluation.objective).toBe(7);
      expect(evaluation.spielwocheMisses).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("finds the known Spielwoche optimum and ignores flexible siblings", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = spielwocheKnownOptimumModel();
      const modelPath = path.join(dir, "model.json");
      const outPath = path.join(dir, "assignment.json");
      const metadataPath = path.join(dir, "metadata.json");
      const weightsPath = path.join(dir, "weights.json");
      const weights = {
        overUsage: 0,
        overUsageFairness: 0,
        wechsel: 0,
        zeitgleich: 0,
        sameClubDerbySt4: 0,
        spielwoche: 7
      };
      await writeFile(modelPath, JSON.stringify(model), "utf8");
      await writeFile(weightsPath, JSON.stringify(weights), "utf8");

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
          "--weights",
          weightsPath,
          "--time-limit",
          "30"
        ],
        { cwd: process.cwd(), timeout: 120_000 }
      );

      const assignment = JSON.parse(await readFile(outPath, "utf8")) as Assignment;
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        objective: number;
        status: string;
      };

      expect(metadata.status).toBe("OPTIMAL");
      expect(metadata.objective).toBe(0);
      expect(assignment["choose-same"]).toBe(12);
      expect(evaluate(model, assignment, weights).spielwocheMisses).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("finds the known capacity optimum when all Spielwoche hints are flexible", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = flexibleCapacityKnownOptimumModel();
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
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        objective: number;
        status: string;
      };
      const evaluation = evaluate(model, assignment);

      expect(metadata.status).toBe("OPTIMAL");
      expect(metadata.objective).toBe(11);
      expect(assignment["choose-same"]).toBe(7);
      expect(evaluation.overUsages).toHaveLength(1);
      expect(evaluation.overUsages[0]?.excess).toBe(1);
      expect(evaluation.spielwocheMisses).toHaveLength(0);
      expect(evaluation.objective).toBe(11);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("shows initial heuristic can score worse than CP-SAT on the same input", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = flexibleCapacityKnownOptimumModel();
      const modelPath = path.join(dir, "model.json");
      const cpSatOutPath = path.join(dir, "cpsat-assignment.json");
      const cpSatMetadataPath = path.join(dir, "cpsat-metadata.json");
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
          cpSatOutPath,
          "--metadata",
          cpSatMetadataPath,
          "--time-limit",
          "30"
        ],
        { cwd: process.cwd(), timeout: 120_000 }
      );

      const heuristic = evaluate(model, startingAssignment(model));
      const cpSat = JSON.parse(await readFile(cpSatMetadataPath, "utf8")) as {
        objective: number;
        status: string;
      };

      expect(cpSat.status).toBe("OPTIMAL");
      expect(cpSat.objective).toBe(11);
      expect(heuristic.objective).toBeGreaterThan(cpSat.objective);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("finds the known capacity optimum for four flexible teams sharing capacity two", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = fourFlexibleTeamsCapacityModel();
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
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        objective: number;
        status: string;
      };
      const evaluation = evaluate(model, assignment);

      expect(metadata.status).toBe("OPTIMAL");
      expect(metadata.objective).toBe(11);
      expect(evaluation.objective).toBe(11);
      expect(evaluation.overUsages).toHaveLength(1);
      expect(evaluation.overUsages[0]?.excess).toBe(1);
      expect(evaluation.spielwocheMisses).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("returns the least-bad plan when capacity excess above one is unavoidable", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-cpsat-"));
    try {
      const model = unavoidableCapacityExcessModel();
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
      const evaluation = evaluate(model, assignment);

      expect(metadata.status).toBe("OPTIMAL");
      expect(evaluation.objective).toBe(metadata.objective);
      expect(evaluation.hardViolations).toHaveLength(0);
      expect(evaluation.overUsages).toContainEqual(
        expect.objectContaining({ excess: 2 })
      );
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
