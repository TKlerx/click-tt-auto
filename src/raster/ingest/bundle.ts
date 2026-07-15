import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

export async function writeRasterDownloadBundle(
  directory: string,
  out = path.join(directory, "raster-inputs.zip")
): Promise<string> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.toLowerCase().endsWith(".zip")) continue;
    const filePath = path.join(directory, entry.name);
    files[entry.name] = await fs.readFile(filePath);
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`No raster input files found to bundle in ${directory}.`);
  }
  await fs.writeFile(out, zipSync(files));
  return out;
}
