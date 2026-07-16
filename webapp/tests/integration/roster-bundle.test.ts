import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/raster/pipeline", () => ({
  rasterIngest: {
    parseRosterCsvBytes: vi.fn(() => ({ charset: "utf-8", rows: [{}] })),
  },
}));

import { readRasterBundle } from "@/lib/raster/bundle";

describe("roster bundle integration", () => {
  it("classifies complete and incomplete bundles", async () => {
    const complete = await readRasterBundle(
      Buffer.from(
        zipSync({
          "roster.csv": new TextEncoder().encode("csv"),
          "wishes.pdf": new TextEncoder().encode("%PDF-1.4"),
        }),
      ),
    );

    expect(complete.missing).toEqual([]);
    expect(complete.files.map((file) => file.kind).sort()).toEqual([
      "roster",
      "wishesPdf",
    ]);

    const incomplete = await readRasterBundle(
      Buffer.from(
        zipSync({ "wishes.pdf": new TextEncoder().encode("%PDF-1.4") }),
      ),
    );

    expect(incomplete.missing).toContain("roster CSV");
  });
});
