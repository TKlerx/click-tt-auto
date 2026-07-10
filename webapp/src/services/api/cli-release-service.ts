import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type CliReleaseTarget =
  | "windows-amd64"
  | "windows-arm64"
  | "linux-amd64"
  | "linux-arm64"
  | "darwin-amd64"
  | "darwin-arm64";

export type CliReleaseAsset = {
  target: CliReleaseTarget;
  label: string;
  filename: string;
  size: number;
  available: boolean;
};

const targetDefinitions: Array<
  Omit<CliReleaseAsset, "filename" | "size" | "available"> & {
    goos: string;
    arch: string;
    extension: "zip" | "tar.gz";
  }
> = [
  {
    target: "windows-amd64",
    label: "Windows x64",
    goos: "windows",
    arch: "amd64",
    extension: "zip",
  },
  {
    target: "windows-arm64",
    label: "Windows ARM64",
    goos: "windows",
    arch: "arm64",
    extension: "zip",
  },
  {
    target: "linux-amd64",
    label: "Linux x64",
    goos: "linux",
    arch: "amd64",
    extension: "tar.gz",
  },
  {
    target: "linux-arm64",
    label: "Linux ARM64",
    goos: "linux",
    arch: "arm64",
    extension: "tar.gz",
  },
  {
    target: "darwin-amd64",
    label: "macOS Intel",
    goos: "darwin",
    arch: "amd64",
    extension: "tar.gz",
  },
  {
    target: "darwin-arm64",
    label: "macOS Apple Silicon",
    goos: "darwin",
    arch: "arm64",
    extension: "tar.gz",
  },
];

const cliReleaseTargets = targetDefinitions.map(({ target }) => target);

export function getCliReleasesDir() {
  return (
    process.env.CLI_RELEASES_DIR ??
    path.join(process.cwd(), "data", "cli-releases")
  );
}

function isCliReleaseTarget(value: string): value is CliReleaseTarget {
  return cliReleaseTargets.includes(value as CliReleaseTarget);
}

async function findArchive(
  dir: string,
  goos: string,
  arch: string,
  extension: string,
) {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const suffix = `_${goos}_${arch}.${extension}`;
  return (
    entries
      .filter(
        (entry) => entry.startsWith("starterctl_") && entry.endsWith(suffix),
      )
      .sort()
      .at(-1) ?? null
  );
}

export async function listCliReleaseAssets(): Promise<CliReleaseAsset[]> {
  const dir = getCliReleasesDir();

  return Promise.all(
    targetDefinitions.map(async (definition) => {
      const filename = await findArchive(
        dir,
        definition.goos,
        definition.arch,
        definition.extension,
      );
      if (!filename) {
        return { ...definition, filename: "", size: 0, available: false };
      }

      const fileStat = await stat(path.join(dir, filename));
      return { ...definition, filename, size: fileStat.size, available: true };
    }),
  );
}

export async function readCliReleaseAsset(target: string) {
  if (!isCliReleaseTarget(target)) {
    return null;
  }

  const definition = targetDefinitions.find((item) => item.target === target);
  if (!definition) {
    return null;
  }

  const dir = getCliReleasesDir();
  const filename = await findArchive(
    dir,
    definition.goos,
    definition.arch,
    definition.extension,
  );
  if (!filename) {
    return null;
  }

  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(resolvedDir, filename);
  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
    return null;
  }

  const buffer = await readFile(resolvedFile);
  return {
    ...definition,
    filename,
    buffer,
    contentType:
      definition.extension === "zip" ? "application/zip" : "application/gzip",
  };
}

export async function readCliChecksums() {
  try {
    return await readFile(
      path.join(getCliReleasesDir(), "checksums.txt"),
      "utf8",
    );
  } catch {
    return null;
  }
}
