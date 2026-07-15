-- CreateEnum
CREATE TYPE "RasterMatchRecordType" AS ENUM ('TEAM');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RasterHallCapacity" WHERE "basis" = 'REVIEWED') THEN
    RAISE EXCEPTION 'Cannot discard Raster data: reviewed hall capacities exist';
  END IF;

  IF EXISTS (SELECT 1 FROM "RasterReviewDecision") THEN
    RAISE EXCEPTION 'Cannot discard Raster data: review decisions exist';
  END IF;
END $$;

DELETE FROM "RasterSnapshot";
DELETE FROM "RasterOptimizationRun";
DELETE FROM "RasterInputSet";
DELETE FROM "RasterHallCapacity";

-- DropIndex
DROP INDEX "RasterHallCapacity_district_clubId_hall_weekday_key";

-- DropIndex
DROP INDEX "RasterHallCapacity_district_clubId_idx";

-- DropIndex
DROP INDEX "RasterInputSet_district_season_createdAt_idx";

-- DropIndex
DROP INDEX "RasterSnapshot_district_createdAt_idx";

-- AlterTable
ALTER TABLE "RasterHallCapacity" DROP COLUMN "district",
ADD COLUMN     "scopeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RasterInputSet" DROP COLUMN "district",
ADD COLUMN     "scopeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RasterSnapshot" DROP COLUMN "district",
ADD COLUMN     "scopeId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "RasterMatchReview" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "recordType" "RasterMatchRecordType" NOT NULL,
    "recordId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RasterMatchReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RasterMatchReview_inputSetId_idx" ON "RasterMatchReview"("inputSetId");

-- CreateIndex
CREATE INDEX "RasterMatchReview_reviewedById_idx" ON "RasterMatchReview"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "RasterMatchReview_inputSetId_recordType_recordId_key" ON "RasterMatchReview"("inputSetId", "recordType", "recordId");

-- CreateIndex
CREATE INDEX "RasterHallCapacity_scopeId_clubId_idx" ON "RasterHallCapacity"("scopeId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "RasterHallCapacity_scopeId_clubId_hall_weekday_key" ON "RasterHallCapacity"("scopeId", "clubId", "hall", "weekday");

-- CreateIndex
CREATE INDEX "RasterInputSet_scopeId_season_createdAt_idx" ON "RasterInputSet"("scopeId", "season", "createdAt");

-- CreateIndex
CREATE INDEX "RasterSnapshot_scopeId_createdAt_idx" ON "RasterSnapshot"("scopeId", "createdAt");

-- AddForeignKey
ALTER TABLE "RasterInputSet" ADD CONSTRAINT "RasterInputSet_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterHallCapacity" ADD CONSTRAINT "RasterHallCapacity_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterSnapshot" ADD CONSTRAINT "RasterSnapshot_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterMatchReview" ADD CONSTRAINT "RasterMatchReview_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterMatchReview" ADD CONSTRAINT "RasterMatchReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
