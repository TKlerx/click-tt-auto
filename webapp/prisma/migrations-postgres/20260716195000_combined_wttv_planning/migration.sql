DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RasterOptimizationRun") THEN
    RAISE EXCEPTION 'Cannot add coverage defaults while RasterOptimizationRun contains existing rows';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "RasterOptimizationRun"
DROP COLUMN IF EXISTS "unresolvedWishConflictsJson",
ADD COLUMN "coverageComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "coverageJson" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "RasterInputSetScope" (
    "id" TEXT NOT NULL,
    "inputSetId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,

    CONSTRAINT "RasterInputSetScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RasterSnapshotScope" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,

    CONSTRAINT "RasterSnapshotScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RasterOptimizationRun_coverageComplete_idx" ON "RasterOptimizationRun"("coverageComplete");

-- CreateIndex
CREATE INDEX "RasterInputSetScope_scopeId_idx" ON "RasterInputSetScope"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "RasterInputSetScope_inputSetId_scopeId_key" ON "RasterInputSetScope"("inputSetId", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "RasterSnapshotScope_snapshotId_scopeId_key" ON "RasterSnapshotScope"("snapshotId", "scopeId");

-- AddForeignKey
ALTER TABLE "RasterInputSetScope" ADD CONSTRAINT "RasterInputSetScope_inputSetId_fkey" FOREIGN KEY ("inputSetId") REFERENCES "RasterInputSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterInputSetScope" ADD CONSTRAINT "RasterInputSetScope_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterSnapshotScope" ADD CONSTRAINT "RasterSnapshotScope_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RasterSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RasterSnapshotScope" ADD CONSTRAINT "RasterSnapshotScope_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
