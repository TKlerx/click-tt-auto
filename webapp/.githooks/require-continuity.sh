#!/usr/bin/env sh
set -eu

CONTINUE_FILE="CONTINUE.md"
CONTINUE_LOG_FILE="CONTINUE_LOG.md"

if [ ! -f "$CONTINUE_FILE" ]; then
  echo "Missing $CONTINUE_FILE. Create it before committing." >&2
  exit 1
fi

if [ ! -f "$CONTINUE_LOG_FILE" ]; then
  echo "Missing $CONTINUE_LOG_FILE. Create it before committing." >&2
  exit 1
fi

STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
exit 0
