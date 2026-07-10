import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listCliReleaseAssets,
  readCliChecksums,
  readCliReleaseAsset,
} from "@/services/api/cli-release-service";

describe("cli-release-service", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "starterctl-releases-"));
    process.env.CLI_RELEASES_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.CLI_RELEASES_DIR;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists starterctl release archives and checksums", async () => {
    await writeFile(join(tempDir, "starterctl_1.2.3_windows_amd64.zip"), "win");
    await writeFile(
      join(tempDir, "starterctl_1.2.3_linux_arm64.tar.gz"),
      "linux",
    );
    await writeFile(
      join(tempDir, "checksums.txt"),
      "abc  starterctl_1.2.3_windows_amd64.zip\n",
    );

    await expect(readCliChecksums()).resolves.toContain("starterctl_1.2.3");
    await expect(listCliReleaseAssets()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "windows-amd64",
          filename: "starterctl_1.2.3_windows_amd64.zip",
          available: true,
        }),
        expect.objectContaining({
          target: "linux-arm64",
          filename: "starterctl_1.2.3_linux_arm64.tar.gz",
          available: true,
        }),
      ]),
    );
  });

  it("reads only known release targets", async () => {
    await writeFile(
      join(tempDir, "starterctl_1.2.2_linux_amd64.tar.gz"),
      "old",
    );
    await writeFile(
      join(tempDir, "starterctl_1.2.3_linux_amd64.tar.gz"),
      "bytes",
    );

    await expect(readCliReleaseAsset("nope")).resolves.toBeNull();
    await expect(readCliReleaseAsset("linux-amd64")).resolves.toEqual(
      expect.objectContaining({
        filename: "starterctl_1.2.3_linux_amd64.tar.gz",
        contentType: "application/gzip",
      }),
    );
  });
});
