CREATE TYPE "RasterSourceIdentityKind" AS ENUM ('CLUB', 'TEAM');
CREATE TYPE "RasterSourceIdentityReviewState" AS ENUM ('PENDING', 'CONFIRMED');
CREATE TYPE "RasterSourceIdentityMatchConfidence" AS ENUM ('EXACT', 'FUZZY', 'MANUAL', 'CREATED');

CREATE TABLE "RasterSourceIdentityAlias" (
  "id" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "kind" "RasterSourceIdentityKind" NOT NULL,
  "rawSourceName" TEXT NOT NULL,
  "normalizedSourceName" TEXT NOT NULL,
  "canonicalIdentity" TEXT,
  "canonicalName" TEXT,
  "matchConfidence" "RasterSourceIdentityMatchConfidence" NOT NULL,
  "source" TEXT NOT NULL,
  "reviewState" "RasterSourceIdentityReviewState" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RasterSourceIdentityAlias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RasterSourceIdentityAlias_scopeId_season_kind_normalizedSourceName_key" ON "RasterSourceIdentityAlias"("scopeId", "season", "kind", "normalizedSourceName");
CREATE INDEX "RasterSourceIdentityAlias_scopeId_season_reviewState_idx" ON "RasterSourceIdentityAlias"("scopeId", "season", "reviewState");
ALTER TABLE "RasterSourceIdentityAlias" ADD CONSTRAINT "RasterSourceIdentityAlias_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
