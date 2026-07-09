#!/usr/bin/env sh
set -eu

SOURCE_DIR="${CLI_RELEASES_SOURCE_DIR:-}"
TARGET_DIR="${CLI_RELEASES_HOST_DIR:-./data/cli-releases}"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[ -n "$SOURCE_DIR" ] || fail "CLI_RELEASES_SOURCE_DIR is required."
[ -d "$SOURCE_DIR" ] || fail "CLI_RELEASES_SOURCE_DIR does not exist: $SOURCE_DIR"

TMP_DIR="${TARGET_DIR}.tmp"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

found=0
for pattern in \
  "starterctl_*_windows_amd64.zip" \
  "starterctl_*_windows_arm64.zip" \
  "starterctl_*_linux_amd64.tar.gz" \
  "starterctl_*_linux_arm64.tar.gz" \
  "starterctl_*_darwin_amd64.tar.gz" \
  "starterctl_*_darwin_arm64.tar.gz" \
  "checksums.txt"
do
  for file in "$SOURCE_DIR"/$pattern; do
    [ -f "$file" ] || continue
    cp "$file" "$TMP_DIR"/
    found=$((found + 1))
  done
done

[ "$found" -gt 0 ] || fail "No CLI release artifacts found in $SOURCE_DIR"

rm -rf "$TARGET_DIR"
mkdir -p "$(dirname "$TARGET_DIR")"
mv "$TMP_DIR" "$TARGET_DIR"

printf 'Installed %s CLI release artifact(s) into %s\n' "$found" "$TARGET_DIR"
