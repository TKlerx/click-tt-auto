FROM node:24-bookworm-slim AS base
WORKDIR /repo/webapp
ENV COREPACK_HOME=/corepack
RUN apt-get update -y \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /corepack \
    && corepack enable \
    && corepack prepare pnpm@11.1.0 --activate

FROM base AS deps
COPY webapp/package.json webapp/pnpm-lock.yaml webapp/pnpm-workspace.yaml webapp/.npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS dependency-audit
COPY webapp/package.json webapp/pnpm-lock.yaml webapp/pnpm-workspace.yaml webapp/.npmrc ./
RUN pnpm install --prod --frozen-lockfile
CMD ["pnpm", "audit", "--prod", "--no-optional", "--json"]

FROM base AS migrate-deps
WORKDIR /migrate-runtime
COPY webapp/docker/migrate/package.json ./package.json
COPY webapp/pnpm-workspace.yaml ./
RUN pnpm install --prod

FROM base AS builder
WORKDIR /repo/webapp
ARG BASE_PATH
ARG APP_VERSION
ARG APP_REVISION
ARG APP_BUILD_ID
ARG APP_BUILT_AT
ENV BASE_PATH=$BASE_PATH
ENV APP_VERSION=$APP_VERSION
ENV APP_REVISION=$APP_REVISION
ENV APP_BUILD_ID=$APP_BUILD_ID
ENV APP_BUILT_AT=$APP_BUILT_AT
ENV AUTH_BASE_URL=http://localhost:3270
ENV BETTER_AUTH_SECRET=docker-build-secret-change-me-at-least-32-characters
ENV APP_DATABASE_URL=postgresql://starter:starter@localhost:5432/business_app_starter
ENV DATABASE_URL=postgresql://starter:starter@localhost:5432/business_app_starter
COPY --from=deps /repo/webapp/node_modules ./node_modules
RUN ln -s /repo/webapp/node_modules /repo/node_modules
COPY webapp/. .
COPY src/raster /repo/src/raster
RUN pnpm exec prisma generate && pnpm run build

FROM base AS migrate-runner
WORKDIR /app
ARG APP_VERSION
ARG APP_REVISION
ARG APP_BUILD_ID
ARG APP_BUILT_AT
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$APP_REVISION
LABEL org.opencontainers.image.created=$APP_BUILT_AT
LABEL org.opencontainers.image.source="https://github.com/TKlerx/webapp-template"
COPY --from=migrate-deps /migrate-runtime/node_modules ./node_modules
COPY --from=builder /repo/webapp/package.json ./package.json
COPY --from=builder /repo/webapp/prisma ./prisma
COPY --from=builder /repo/webapp/prisma.config.ts ./prisma.config.ts
COPY --from=builder /repo/webapp/scripts ./scripts
RUN rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx \
    && rm -rf /usr/local/lib/node_modules/npm /corepack

FROM base AS runner
WORKDIR /app
ARG APP_VERSION
ARG APP_REVISION
ARG APP_BUILD_ID
ARG APP_BUILT_AT
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$APP_REVISION
LABEL org.opencontainers.image.created=$APP_BUILT_AT
LABEL org.opencontainers.image.source="https://github.com/TKlerx/webapp-template"
ENV NODE_ENV=production
ENV PORT=3270
ENV HOSTNAME=0.0.0.0
ENV APP_VERSION=$APP_VERSION
ENV APP_REVISION=$APP_REVISION
ENV APP_BUILD_ID=$APP_BUILD_ID
ENV APP_BUILT_AT=$APP_BUILT_AT
COPY --from=builder /repo/webapp/.next/standalone ./
COPY --from=builder /repo/webapp/.next/static ./.next/static
COPY --from=builder /repo/webapp/generated ./generated
COPY --from=builder /repo/webapp/package.json ./package.json
RUN rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx \
    && rm -rf /usr/local/lib/node_modules/npm /corepack \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/uploads /data \
    && chown -R nextjs:nodejs /app /data
USER nextjs
EXPOSE 3270
CMD ["node", "server.js"]
