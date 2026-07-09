#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function git(args, options = {}) {
  return execFileSync("git", args, {
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
}

function getStagedFiles() {
  const output = git(
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    { encoding: "buffer" },
  );

  return output.toString("utf8").split("\0").filter(Boolean);
}

function getStagedBlob(path) {
  return git(["show", `:${path}`], { encoding: "buffer" });
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function hasUtf8Bom(buffer) {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  );
}

function validateTextBlob(path, buffer) {
  const failures = [];

  if (hasUtf8Bom(buffer)) {
    failures.push("UTF-8 BOM");
  }

  let text = "";
  try {
    text = utf8Decoder.decode(buffer);
  } catch {
    failures.push("invalid UTF-8");
  }

  if (text.includes("\r")) {
    failures.push("CRLF/CR line endings");
  }

  return failures.map((failure) => `${path}: ${failure}`);
}

const failures = [];

for (const path of getStagedFiles()) {
  const buffer = getStagedBlob(path);

  if (isBinary(buffer)) {
    continue;
  }

  failures.push(...validateTextBlob(path, buffer));
}

if (failures.length > 0) {
  console.error(
    "Text convention check failed. Use UTF-8 without BOM and LF line endings.",
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
