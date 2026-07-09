import { homeWeeks, rasterSizeForGroupSize } from "../rulebook/rulebook.js";
import type { RasterSize, WeekSlot } from "../types.js";

export function deriveHomeWeeks(
  groupSize: number,
  rasterzahl: number
): { rasterSize: RasterSize; weeks: number[]; slot: WeekSlot } {
  const rasterSize = rasterSizeForGroupSize(groupSize);
  const weeks = homeWeeks(rasterSize, rasterzahl, groupSize);
  const oddWeeks = weeks.filter((week) => week % 2 === 1).length;
  return {
    rasterSize,
    weeks,
    slot: oddWeeks >= weeks.length - oddWeeks ? "A" : "B"
  };
}
