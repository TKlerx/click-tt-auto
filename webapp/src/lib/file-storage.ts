import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

function sanitizeExtension(originalName: string) {
  const extension = path
    .extname(originalName)
    .replace(/[^a-zA-Z0-9.]/g, "")
    .toLowerCase();
  return extension || ".bin";
}

export async function saveFile(buffer: Buffer, originalName: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const relativeDir = path.posix.join("uploads", year, month);
  const fileName = `${randomUUID()}${sanitizeExtension(originalName)}`;
  const relativePath = path.posix.join(relativeDir, fileName);
  const absoluteDir = path.join(UPLOADS_DIR, year, month);
  const absolutePath = path.join(absoluteDir, fileName);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });

  return relativePath;
}

export function getFilePath(storedPath: string) {
  const absolutePath = path.resolve(process.cwd(), storedPath);

  if (!absolutePath.startsWith(UPLOADS_DIR)) {
    throw new Error("INVALID_FILE_PATH");
  }

  return absolutePath;
}

export async function assertStoredFileExists(storedPath: string) {
  await stat(getFilePath(storedPath));
}
