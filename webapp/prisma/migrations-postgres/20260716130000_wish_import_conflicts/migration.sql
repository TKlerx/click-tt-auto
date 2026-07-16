CREATE TYPE "RasterWishOrigin" AS ENUM ('IMPORTED', 'MANUAL');
CREATE TYPE "RasterWishImportKind" AS ENUM ('PDF', 'JSON');
CREATE TYPE "RasterConflictDecision" AS ENUM ('KEEP_EXISTING', 'USE_IMPORTED', 'MANUAL');

ALTER TABLE "RasterWish"
  ADD COLUMN "origin" "RasterWishOrigin" NOT NULL DEFAULT 'IMPORTED',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;

ALTER TABLE "RasterOptimizationRun"
  ADD COLUMN "unresolvedWishConflictsJson" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "RasterWishImportBatch" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceKind" "RasterWishImportKind" NOT NULL,

    CONSTRAINT "RasterWishImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RasterImportedWishRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "sourceFile" TEXT,
    "matchedWishId" TEXT,
    "clubId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "teamLabel" TEXT,
    "homeWeekday" "RasterWeekday" NOT NULL,
    "hall" TEXT,
    "startTime" TEXT,
    "spielwochePref" TEXT,
    "requestedRasterzahl" TEXT,
    "notes" TEXT,
    "valueFingerprint" TEXT NOT NULL,

    CONSTRAINT "RasterImportedWishRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RasterWishConflict" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "wishId" TEXT NOT NULL,
    "importedRowId" TEXT NOT NULL,
    "differingFields" TEXT NOT NULL,
    "decision" "RasterConflictDecision",
    "decidedValueJson" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "RasterWishConflict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RasterWish_reviewedById_idx" ON "RasterWish"("reviewedById");

-- One active wish per (inputSetId, clubId, teamLabel). Split into two partial
-- indexes because Postgres treats NULLs as distinct, so a plain unique index
-- would let unlimited teamLabel IS NULL rows through -- exactly the duplicate
-- the import path must not create. Prisma cannot express partial indexes, so
-- schema.postgres.prisma declares a plain @@unique and `prisma migrate dev`
-- will report drift against these; keep them and discard the generated fix.
CREATE UNIQUE INDEX "RasterWish_inputSetId_clubId_teamLabel_key" ON "RasterWish"("inputSetId", "clubId", "teamLabel") WHERE "teamLabel" IS NOT NULL;
CREATE UNIQUE INDEX "RasterWish_inputSetId_clubId_noTeamLabel_key" ON "RasterWish"("inputSetId", "clubId") WHERE "teamLabel" IS NULL;
CREATE INDEX "RasterWishImportBatch_inputSetId_startedAt_idx" ON "RasterWishImportBatch"("inputSetId", "startedAt");
CREATE INDEX "RasterWishImportBatch_startedById_idx" ON "RasterWishImportBatch"("startedById");
CREATE INDEX "RasterImportedWishRow_batchId_idx" ON "RasterImportedWishRow"("batchId");
CREATE INDEX "RasterImportedWishRow_inputSetId_idx" ON "RasterImportedWishRow"("inputSetId");
CREATE INDEX "RasterImportedWishRow_matchedWishId_idx" ON "RasterImportedWishRow"("matchedWishId");
CREATE UNIQUE INDEX "RasterWishConflict_wishId_importedRowId_key" ON "RasterWishConflict"("wishId", "importedRowId");
CREATE INDEX "RasterWishConflict_inputSetId_decision_idx" ON "RasterWishConflict"("inputSetId", "decision");
CREATE INDEX "RasterWishConflict_decidedById_idx" ON "RasterWishConflict"("decidedById");

ALTER TABLE "RasterWish" ADD CONSTRAINT "RasterWish_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RasterWishImportBatch" ADD CONSTRAINT "RasterWishImportBatch_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterWishImportBatch" ADD CONSTRAINT "RasterWishImportBatch_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RasterImportedWishRow" ADD CONSTRAINT "RasterImportedWishRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RasterWishImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterImportedWishRow" ADD CONSTRAINT "RasterImportedWishRow_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterImportedWishRow" ADD CONSTRAINT "RasterImportedWishRow_matchedWishId_fkey" FOREIGN KEY ("matchedWishId") REFERENCES "RasterWish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RasterWishConflict" ADD CONSTRAINT "RasterWishConflict_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterWishConflict" ADD CONSTRAINT "RasterWishConflict_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "RasterWish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterWishConflict" ADD CONSTRAINT "RasterWishConflict_importedRowId_fkey" FOREIGN KEY ("importedRowId") REFERENCES "RasterImportedWishRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RasterWishConflict" ADD CONSTRAINT "RasterWishConflict_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
