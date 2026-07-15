import { unzipSync } from "fflate";
import { rasterIngest } from "@/lib/raster/pipeline";

export type RasterBundleFile =
  | { kind: "roster"; name: string; bytes: Buffer }
  | { kind: "wishesPdf"; name: string; bytes: Buffer };

export type RasterBundleResult = {
  files: RasterBundleFile[];
  missing: string[];
  unrecognized: string[];
};

export async function readRasterBundle(
  bytes: Buffer,
): Promise<RasterBundleResult> {
  const entries = unzipSync(bytes);
  const files: RasterBundleFile[] = [];
  const unrecognized: string[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    const data = Buffer.from(entry);
    if (data.length === 0 || /\/$/.test(name)) continue;
    if (isPdf(data)) {
      files.push({ kind: "wishesPdf", name, bytes: data });
      continue;
    }
    if (/\.csv$/i.test(name)) {
      try {
        await rasterIngest.parseRosterCsvBytes(data);
        files.push({ kind: "roster", name, bytes: data });
        continue;
      } catch {
        // Not the Tabellen export; report below.
      }
    }
    unrecognized.push(name);
  }

  const missing = [
    files.some((file) => file.kind === "roster") ? "" : "roster CSV",
    files.some((file) => file.kind === "wishesPdf") ? "" : "wish PDFs",
  ].filter(Boolean);

  return { files, missing, unrecognized };
}

export function isZip(buffer: Buffer) {
  return buffer.subarray(0, 4).toString("binary") === "PK\u0003\u0004";
}

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
