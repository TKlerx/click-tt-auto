import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { writeRasterDownloadBundle } from "../../src/raster/ingest/bundle.js";

describe("raster download bundle", () => {
  it("zips collected input files and skips old zips", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "raster-bundle-"));
    try {
      await writeFile(path.join(dir, "roster.csv"), "csv");
      await writeFile(path.join(dir, "wishes.pdf"), "%PDF-1.4");
      await writeFile(path.join(dir, "old.zip"), "old");

      const out = await writeRasterDownloadBundle(dir);
      const zip = unzipSync(await readFile(out));

      expect(Object.keys(zip).sort()).toEqual(["roster.csv", "wishes.pdf"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
