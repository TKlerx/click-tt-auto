ALTER TABLE "RasterSource" ADD COLUMN "season" TEXT NOT NULL DEFAULT '2026/27';
ALTER TABLE "RasterInputSet" ADD COLUMN "season" TEXT NOT NULL DEFAULT '2026/27';

DROP INDEX "RasterSource_scopeId_sourceType_idx";
DROP INDEX "RasterSource_scopeId_sourceType_sourceRef_key";
DROP INDEX "RasterInputSet_district_createdAt_idx";

CREATE UNIQUE INDEX "RasterSource_scopeId_season_sourceType_sourceRef_key" ON "RasterSource"("scopeId", "season", "sourceType", "sourceRef");
CREATE INDEX "RasterSource_scopeId_season_sourceType_idx" ON "RasterSource"("scopeId", "season", "sourceType");
CREATE INDEX "RasterInputSet_district_season_createdAt_idx" ON "RasterInputSet"("district", "season", "createdAt");
