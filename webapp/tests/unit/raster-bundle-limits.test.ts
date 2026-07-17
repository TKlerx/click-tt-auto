import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/raster/pipeline", () => ({
  rasterIngest: {
    parseRosterCsvBytes: vi.fn(() => ({ charset: "utf-8", rows: [] })),
  },
}));

import { rasterBundleLimits, readRasterBundle } from "@/lib/raster/bundle";

const zipOf = (files: Record<string, Uint8Array>) =>
  Buffer.from(zipSync(files));

describe("raster bundle limits", () => {
  it("refuses a zip bomb instead of expanding it", async () => {
    // ~64 MB of zeros compresses to a few KB; the cap must bite on the
    // declared size, before anything is inflated.
    const bomb = zipOf({ "big.csv": new Uint8Array(64 * 1024 * 1024) });

    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(readRasterBundle(bomb)).rejects.toThrow(
      /expands to more than/i,
    );
  });

  it("refuses a bundle with too many entries", async () => {
    const many: Record<string, Uint8Array> = {};
    for (let index = 0; index <= rasterBundleLimits.maxEntries; index += 1) {
      many[`file-${index}.csv`] = new TextEncoder().encode("x");
    }

    await expect(readRasterBundle(zipOf(many))).rejects.toThrow(
      /more than \d+ entries/i,
    );
  });

  it("still reads a bundle inside the limits", async () => {
    const bundle = zipOf({
      "roster.csv": new TextEncoder().encode("Region;Saison"),
      "wishes.pdf": new TextEncoder().encode("%PDF-1.4 wishes"),
    });

    const result = await readRasterBundle(bundle);

    expect(result.missing).toEqual([]);
    expect(result.files.map((file) => file.kind).sort()).toEqual([
      "roster",
      "wishesPdf",
    ]);
  });
});
