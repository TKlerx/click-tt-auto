#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-webapp-template}"
export COMPOSE_PROJECT_NAME

generate_app_version() {
  head_iso="$(git show -s --format=%cI HEAD)"
  head_date="$(TZ=UTC git show -s --date=format-local:%Y%m%d --format=%cd HEAD)"
  day_start="$(TZ=UTC git show -s --date=format-local:%Y-%m-%dT00:00:00.000Z --format=%cd HEAD)"
  sequence="$(git rev-list --count --first-parent --since="$day_start" --until="$head_iso" HEAD)"
  printf '%s.%s' "$head_date" "$sequence"
}

APP_VERSION="${APP_VERSION:-$(generate_app_version)}"
export APP_VERSION

step() {
  printf '\n=== %s ===\n' "$1"
}

step "Build metadata"
printf 'APP_VERSION=%s\n' "$APP_VERSION"
printf 'COMPOSE_PROJECT_NAME=%s\n' "$COMPOSE_PROJECT_NAME"

step "Compose data volumes"
docker compose -f "$COMPOSE_FILE" config --volumes

step "Build shared app image"
docker compose -f "$COMPOSE_FILE" build app

step "Start PostgreSQL"
docker compose -f "$COMPOSE_FILE" up -d postgres

step "Prisma pre-deploy verification"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint sh migrate -lc "node scripts/prisma-predeploy-check.js"

step "Pre-deploy PostgreSQL backup"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-5}" sh ./scripts/backup-postgres.sh

if [ "${CLI_RELEASES_BUILD_DURING_DEPLOY:-false}" = "docker" ]; then
  step "Clean old CLI build cache volumes"
  docker volume rm webapp-template-cli-go-mod webapp-template-cli-go-build >/dev/null 2>&1 || true

  step "Build CLI release builder image"
  docker build -f Dockerfile.cli-builder -t webapp-template-cli-builder:latest .

  step "Build CLI release artifacts"
  docker run --rm \
    -e GOMODCACHE=/tmp/go/pkg/mod \
    -e GOCACHE=/tmp/go-build \
    -v "$(pwd):/workspace" \
    -w /workspace/cli \
    webapp-template-cli-builder:latest \
    release --snapshot --clean --config .goreleaser.yaml

  step "Install CLI release artifacts"
  CLI_RELEASES_SOURCE_DIR="${CLI_RELEASES_SOURCE_DIR:-./cli/dist}" \
    CLI_RELEASES_HOST_DIR="${CLI_RELEASES_HOST_DIR:-./data/cli-releases}" \
    sh ./scripts/install-cli-releases.sh
elif [ "${CLI_RELEASES_BUILD_DURING_DEPLOY:-false}" = "true" ]; then
  step "Build CLI release artifacts"
  pnpm cli:dist

  step "Install CLI release artifacts"
  CLI_RELEASES_SOURCE_DIR="${CLI_RELEASES_SOURCE_DIR:-./cli/dist}" \
    CLI_RELEASES_HOST_DIR="${CLI_RELEASES_HOST_DIR:-./data/cli-releases}" \
    sh ./scripts/install-cli-releases.sh
elif [ -n "${CLI_RELEASES_SOURCE_DIR:-}" ]; then
  step "Install CLI release artifacts"
  CLI_RELEASES_SOURCE_DIR="$CLI_RELEASES_SOURCE_DIR" \
    CLI_RELEASES_HOST_DIR="${CLI_RELEASES_HOST_DIR:-./data/cli-releases}" \
    sh ./scripts/install-cli-releases.sh
else
  step "CLI release artifacts"
  printf 'CLI_RELEASES_BUILD_DURING_DEPLOY is not true/docker and CLI_RELEASES_SOURCE_DIR is not set; keeping existing artifacts in %s\n' "${CLI_RELEASES_HOST_DIR:-./data/cli-releases}"
fi

step "Prisma migrate deploy"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint sh migrate -lc "pnpm exec prisma migrate deploy --config prisma.config.postgres.ts"

step "Rebuild and restart app + worker"
docker compose -f "$COMPOSE_FILE" up -d --build app worker

printf '\nDeploy completed successfully.\n'
