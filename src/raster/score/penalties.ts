import { relation } from "../rulebook/rulebook.js";
import { deriveHomeWeeks, unusedRasterzahl } from "./derive.js";
import type {
  Assignment,
  OverUsage,
  SeasonModel,
  WishResult
} from "../types.js";

function assigned(
  teamId: string,
  assignment: Assignment,
  model: SeasonModel
): number | undefined {
  const team = model.teams.find((candidate) => candidate.id === teamId);
  if (!team) return undefined;
  if (team.rasterzahl.kind === "fixed" || team.rasterzahl.kind === "pinned")
    return team.rasterzahl.value;
  return assignment[teamId];
}

export function findOverUsages(
  model: SeasonModel,
  assignment: Assignment
): OverUsage[] {
  const slots = new Map<
    string,
    { teams: Array<{ id: string; startMinutes: number | null }>; capacity: number }
  >();
  const inferredCapacities = new Map<string, number>();
  for (const team of model.teams) {
    if (!team.spielwochePref) continue;
    const key = `${team.clubId}|${team.hall}|${team.homeWeekday}|${team.spielwochePref}`;
    inferredCapacities.set(key, (inferredCapacities.get(key) ?? 0) + 1);
  }
  for (const team of model.teams) {
    const group = model.groups.find((candidate) =>
      candidate.teamIds.includes(team.id)
    );
    const rz = assigned(team.id, assignment, model);
    if (!group || rz === undefined) continue;
    const club = model.clubs.find((candidate) => candidate.id === team.clubId);
    const venue = club?.venues.find((candidate) => candidate.hall === team.hall);
    const inferredCapacity = Math.max(
      inferredCapacities.get(`${team.clubId}|${team.hall}|${team.homeWeekday}|A`) ?? 0,
      inferredCapacities.get(`${team.clubId}|${team.hall}|${team.homeWeekday}|B`) ?? 0
    );
    const capacity = venue?.capacityByWeekday?.[team.homeWeekday] ?? venue?.capacity ?? (inferredCapacity || undefined);
    if (capacity === undefined) continue;
    const bye = unusedRasterzahl(group, assignment);
    for (const week of new Set(deriveHomeWeeks(group.size, rz, group.rasterMode, bye).weeks)) {
      const key = `${team.clubId}|${team.hall}|${team.homeWeekday}|${week}`;
      const bucket = slots.get(key) ?? { teams: [], capacity };
      bucket.teams.push({
        id: team.id,
        startMinutes: parseStartMinutes(team.startTime)
      });
      bucket.capacity = capacity;
      slots.set(key, bucket);
    }
  }

  return [...slots.entries()].flatMap(([key, bucket]) => {
    const actualCount = requiredCapacity(bucket.teams);
    if (actualCount <= bucket.capacity) return [];
    const [clubId, hall, weekday, week] = key.split("|");
    const excess = actualCount - bucket.capacity;
    return [
      {
        clubId: clubId!,
        hall: hall!,
        weekday: weekday as OverUsage["weekday"],
        week: Number(week),
        teams: bucket.teams.map((team) => team.id),
        capacity: bucket.capacity,
        excess
      }
    ];
  });
}

function requiredCapacity(teams: Array<{ startMinutes: number | null }>): number {
  const unknownTimes = teams.filter((team) => team.startMinutes === null).length;
  const events = teams
    .filter((team): team is { startMinutes: number } =>
      Number.isInteger(team.startMinutes)
    )
    .flatMap((team) => [
      { minute: team.startMinutes, delta: 1 },
      { minute: team.startMinutes + 180, delta: -1 }
    ])
    .sort((a, b) => a.minute - b.minute || a.delta - b.delta);
  let concurrent = 0;
  let maxConcurrent = 0;
  for (const event of events) {
    concurrent += event.delta;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
  }
  return maxConcurrent + unknownTimes;
}

function parseStartMinutes(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function evaluateWishes(
  model: SeasonModel,
  assignment: Assignment
): WishResult[] {
  return model.wishes.map((wish) => {
    const teamA = model.teams.find((team) => team.id === wish.teamA);
    const teamB = model.teams.find((team) => team.id === wish.teamB);
    if (!teamA || !teamB)
      return { wish, status: "unknown", reason: "team not found" };
    const groupA = model.groups.find((group) =>
      group.teamIds.includes(teamA.id)
    );
    const groupB = model.groups.find((group) =>
      group.teamIds.includes(teamB.id)
    );
    const rzA = assigned(teamA.id, assignment, model);
    const rzB = assigned(teamB.id, assignment, model);
    if (!groupA || !groupB || rzA === undefined || rzB === undefined)
      return { wish, status: "unknown", reason: "missing group or assignment" };
    const byeA = unusedRasterzahl(groupA, assignment);
    const byeB = unusedRasterzahl(groupB, assignment);
    const derivedA = deriveHomeWeeks(groupA.size, rzA, groupA.rasterMode, byeA);
    const derivedB = deriveHomeWeeks(groupB.size, rzB, groupB.rasterMode, byeB);
    const actual =
      byeA !== null || byeB !== null
        ? relationFromWeeks(derivedA.weeks, derivedB.weeks)
        : relation(derivedA.rasterSize, rzA, derivedB.rasterSize, rzB);
    if (actual === wish.relation) return { wish, status: "fulfilled" };
    return {
      wish,
      status: "unfulfilled",
      reason: `expected ${wish.relation}, got ${actual}`
    };
  });
}

function relationFromWeeks(
  weeksA: number[],
  weeksB: number[]
): "wechsel" | "zeitgleich" | "neither" {
  const a = new Set(weeksA);
  const b = new Set(weeksB);
  const overlap = [...a].filter((week) => b.has(week)).length;
  if (overlap === 0) return "wechsel";
  if (overlap === Math.min(a.size, b.size)) return "zeitgleich";
  return "neither";
}
