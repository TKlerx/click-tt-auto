ALTER TABLE "RasterOptimizationRun" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "RasterSnapshot" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "RasterOptimizationRun_archivedAt_idx" ON "RasterOptimizationRun"("archivedAt");
CREATE INDEX "RasterSnapshot_archivedAt_idx" ON "RasterSnapshot"("archivedAt");
