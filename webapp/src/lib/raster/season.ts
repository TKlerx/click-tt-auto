export const DEFAULT_RASTER_SEASON = "2026/27";

export function normalizeRasterSeason(value: string | null | undefined) {
  return value?.trim() || DEFAULT_RASTER_SEASON;
}

export function rasterSeasonOptions() {
  return ["2026/27", "2027/28", "2028/29"];
}
