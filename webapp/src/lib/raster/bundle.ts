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

export const rasterBundleLimits = {
  maxEntries: 64,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
};

export async function readRasterBundle(
  bytes: Buffer,
): Promise<RasterBundleResult> {
  const entries = unzipSync(bytes, { filter: withinBundleLimits() });
  const files: RasterBundleFile[] = [];
  const unrecognized: string[] = [];
  let totalBytes = 0;

  for (const [name, entry] of Object.entries(entries)) {
    const data = Buffer.from(entry);
    totalBytes += data.length;
    if (totalBytes > rasterBundleLimits.maxTotalBytes) {
      throw new Error(
        `Raster bundle expands to more than ${mib(rasterBundleLimits.maxTotalBytes)} MB.`,
      );
    }
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

function withinBundleLimits() {
  let entries = 0;
  let declaredBytes = 0;
  return (file: { name: string; originalSize: number }) => {
    entries += 1;
    if (entries > rasterBundleLimits.maxEntries) {
      throw new Error(
        `Raster bundle holds more than ${rasterBundleLimits.maxEntries} entries.`,
      );
    }
    if (file.originalSize > rasterBundleLimits.maxEntryBytes) {
      throw new Error(
        `${file.name} expands to more than ${mib(rasterBundleLimits.maxEntryBytes)} MB.`,
      );
    }
    declaredBytes += file.originalSize;
    if (declaredBytes > rasterBundleLimits.maxTotalBytes) {
      throw new Error(
        `Raster bundle expands to more than ${mib(rasterBundleLimits.maxTotalBytes)} MB.`,
      );
    }
    return true;
  };
}

function mib(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

export function isZip(buffer: Buffer) {
  return buffer.subarray(0, 4).toString("binary") === "PK\u0003\u0004";
}

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
