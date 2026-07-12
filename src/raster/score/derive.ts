import {
  homeWeeks,
  numericRasterSize,
  rasterSizeForGroupSize
} from "../rulebook/rulebook.js";
import type {
  Assignment,
  RasterMode,
  RasterSize,
  SeasonModel,
  WeekSlot
} from "../types.js";

export function deriveHomeWeeks(
  groupSize: number,
  rasterzahl: number,
  mode: RasterMode = "single",
  bye?: number | null
): { rasterSize: RasterSize; weeks: number[]; slot: WeekSlot } {
  const rasterSize = rasterSizeForGroupSize(groupSize, mode);
  const weeks = homeWeeks(rasterSize, rasterzahl, groupSize, bye);
  const oddWeeks = weeks.filter((week) => week % 2 === 1).length;
  return {
    rasterSize,
    weeks,
    slot: oddWeeks >= weeks.length - oddWeeks ? "A" : "B"
  };
}

export function unusedRasterzahl(
  group: SeasonModel["groups"][number],
  assignment: Assignment
): number | null {
  if (group.size % 2 === 0) return null;
  const maxRasterzahl = numericRasterSize(
    rasterSizeForGroupSize(group.size, group.rasterMode)
  );
  const used = new Set(
    group.teamIds
      .map((teamId) => assignment[teamId])
      .filter((value): value is number => value !== undefined)
  );
  return (
    Array.from({ length: maxRasterzahl }, (_, index) => index + 1).find(
      (value) => !used.has(value)
    ) ?? null
  );
}
