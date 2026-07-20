ALTER TABLE "RasterSource" ADD COLUMN "inputSetId" TEXT;

DROP INDEX "RasterSource_scopeId_season_sourceType_sourceRef_key";

CREATE UNIQUE INDEX "RasterSource_inputSetId_sourceType_sourceRef_key"
ON "RasterSource"("inputSetId", "sourceType", "sourceRef");

-- Intentional partial index; Prisma schema cannot represent this and may report drift.
CREATE UNIQUE INDEX "RasterSource_legacy_scope_season_type_ref_key"
ON "RasterSource"("scopeId", "season", "sourceType", "sourceRef")
WHERE "inputSetId" IS NULL;

CREATE INDEX "RasterSource_inputSetId_idx" ON "RasterSource"("inputSetId");

ALTER TABLE "RasterSource"
ADD CONSTRAINT "RasterSource_inputSetId_fkey"
FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
