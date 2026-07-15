import type { ManualAssignmentRow } from "@/lib/raster/manualAssignments";

export function parseManualAssignmentPaste(
  value: string,
): ManualAssignmentRow[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const cells = line
        .split(/\t|;|,/)
        .map((cell) => cell.trim())
        .filter(Boolean);
      const parts = cells.length > 1 ? cells : line.split(/\s+/);
      let rasterIndex = -1;
      for (let index = parts.length - 1; index >= 0; index -= 1) {
        if (/^\d+$/.test(parts[index] ?? "")) {
          rasterIndex = index;
          break;
        }
      }
      if (rasterIndex < 0) return [];
      const rasterzahl = Number(parts[rasterIndex]);
      const label = parts
        .filter((_, index) => index !== rasterIndex)
        .join(" ")
        .trim();
      return label ? [{ teamLabel: label, rasterzahl }] : [];
    });
}
